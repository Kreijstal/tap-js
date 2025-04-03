const _ = require('lodash');

var TinyTestHarness = (function () {
  // --- Simple EventEmitter ---
  // Basic event emitter for signaling completion, compatible with most engines
  function EventEmitter() {
    this._listeners = {};
  }
  EventEmitter.prototype.on = function (event, listener) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(listener);
  };
  EventEmitter.prototype.emit = function (event) {
    var listeners = this._listeners[event];
    if (!listeners) return;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i].apply(null, args);
      } catch (e) {
        // Don't let listener errors stop others
        console.error("Error in listener for event '" + event + "':", e);
      }
    }
  };

  // --- Test Context Object ---
  function TestContext(name, harness, parent) {
    this._harness = harness;
    this._parent = parent;
    this.name = name;
    this._results = [];
    this._children = [];
    this._pendingChildren = 0;
    this._pendingAsync = 0; // Track pending async operations
    this._ended = false;
    this._plan = null; // Optional: number of assertions planned
    this._assertionCount = 0;
    this._failed = false; // Track if this test or any children failed
    this._emitter = new EventEmitter();

    // Output test start immediately
    this._log("# " + this.name);
  }

  TestContext.prototype.on = function(event, listener) {
    this._emitter.on(event, listener);
    return this;
  };

  TestContext.prototype._log = function (message) {
    this._harness._addOutput(message.trim());
  };

  TestContext.prototype._addResult = function (ok, message, details) {
    this._assertionCount++;
    var result = {
      ok: !!ok,
      id: this._harness._assertionId++,
      message: message || (ok ? "unnamed assertion" : "unnamed failure"),
      details: details
    };
    this._results.push(result);
    if (!ok) {
      this._failed = true; // Mark this test as failed
      var current = this;
      while (current) {
        // Propagate failure upwards
        current._failed = true;
        current = current._parent;
      }
      this._log("not ok " + result.id + " " + result.message);
      if (details) {
        this._log("  ---");
        this._log("  operator: " + details.operator);
        if (details.hasOwnProperty("expected")) {
          this._log("  expected: " + JSON.stringify(details.expected));
        }
        if (details.hasOwnProperty("actual")) {
          this._log("  actual:   " + JSON.stringify(details.actual));
        }
        if (details.error) {
            var stack = details.error.stack ? String(details.error.stack) : String(details.error);
            // Indent stack trace
            var indentedStack = stack.split('\n').map(function(line) { return '    ' + line; }).join('\n');
            this._log("  error: |-\n" + indentedStack);
        }
        this._log("  ...");
      }
    } else {
      this._log("ok " + result.id + " " + result.message);
    }
    return result.ok;
  };

  TestContext.prototype.pass = function (message) {
    return this._addResult(true, message);
  };

  TestContext.prototype.fail = function (message) {
    var details = { operator: 'fail' };
    // Try to capture stack trace at the point of failure
    try { throw new Error(message); } catch (e) { details.error = e; }
    return this._addResult(false, message, details);
  };

  TestContext.prototype.equal = function (actual, expected, message) {
    var ok = actual === expected;
    message = message || "should be equal";
    return this._addResult(ok, message, {
      operator: "equal",
      actual: actual,
      expected: expected
    });
  };

  TestContext.prototype.deepEqual = function (actual, expected, message) {
    var ok = _.isEqual(actual, expected);
    message = message || "should be deeply equal";
    return this._addResult(ok, message, {
      operator: "deepEqual",
      actual: actual,
      expected: expected
    });
  };

  TestContext.prototype.throws = function (fn, expectedError, message) {
      var caught = null;
      var ok = false;
      message = message || 'should throw';
      try {
          fn();
      } catch (e) {
          caught = e;
      }

      if (caught) {
          if (!expectedError) {
              // Any error is okay if none specified
              ok = true;
          } else if (typeof expectedError === 'function' && caught instanceof expectedError) {
              // Check constructor
              ok = true;
          } else if (expectedError instanceof RegExp && expectedError.test(String(caught))) {
              // Check regex against error message
              ok = true;
          } else if (typeof expectedError === 'string' && String(caught).indexOf(expectedError) !== -1) {
              // Check string substring
              ok = true;
          }
      }

      var details = { operator: 'throws', actual: caught };
      if (expectedError) {
          details.expected = String(expectedError);
      }
      if (!ok) {
          details.error = caught || new Error('Function did not throw');
      }

      return this._addResult(ok, message, details);
  };

  TestContext.prototype.test = function (name, cb) {
    if (this._ended) {
        throw new Error("Cannot call t.test() after t.end()");
    }
    var child = new TestContext(name, this._harness, this);
    this._children.push(child);
    this._pendingChildren++;
    this._harness._enqueue(function () {
      child._run(cb);
    });
  };

  TestContext.prototype._run = function (cb) {
    var self = this;
    try {
      cb(self);
    } catch (e) {
      self._addResult(false, "test function threw synchronously", {
          operator: 'error',
          actual: e,
          error: e
      });
      self.end();
    }
  };

  TestContext.prototype.end = function () {
    if (this._ended) {
      return;
    }
    if (this._pendingChildren > 0 || this._pendingAsync > 0) {
      this._waitingToEnd = true;
      return;
    }

    if (this._plan !== null && this._plan !== this._assertionCount) {
      this._addResult(false, "plan != count", {
          operator: 'plan',
          expected: this._plan,
          actual: this._assertionCount
      });
    }

    this._ended = true;

    if (this._failed) {
      this._emitter.emit('error', new Error('Test failed'));
    }

    if (this._parent) {
      this._parent._childEnded(this);
    } else {
      this._harness._testEnded(this);
    }
  };

  TestContext.prototype.done = function() {
    this._pendingAsync--;
    if (this._pendingAsync < 0) {
      this._pendingAsync = 0;
    }
    if (this._waitingToEnd && this._pendingChildren === 0 && this._pendingAsync === 0) {
      this.end();
    }
  };

  TestContext.prototype._childEnded = function (child) {
    this._pendingChildren--;
    if (this._pendingChildren < 0) {
        console.error("INTERNAL ERROR: Pending children count went negative for test '" + this.name + "'");
        this._pendingChildren = 0;
    }
    if (this._waitingToEnd && this._pendingChildren === 0 && this._pendingAsync === 0) {
      this.end();
    }
  };

  // --- Harness ---
  function Harness() {
    this._output = [];
    this._queue = [];
    this._running = false;
    this._assertionId = 1;
    this._topLevelTests = [];
    this._pendingTests = 0;
    this._totalAssertions = 0;
    this._totalFailed = 0;
    this._emitter = new EventEmitter();
    this._streamListeners = [];
    // Store output until stream is connected
    this._bufferedOutput = [];
    this._addOutput("TAP version 13");
  }

  Harness.prototype.on = function(event, listener) {
    this._emitter.on(event, listener);
    return this;
  };

  Harness.prototype._addOutput = function (line) {
    // Ensure line doesn't already end with newline
    const cleanLine = line.endsWith('\n') ? line.slice(0, -1) : line;
    this._output.push(cleanLine);
    this._bufferedOutput.push(cleanLine);
    // Send to all active stream listeners
    for (var i = 0; i < this._streamListeners.length; i++) {
        try {
            this._streamListeners[i](cleanLine);
            if (this._streamListeners[i]._destination) {
                this._streamListeners[i]._destination.write(cleanLine + '\n');
            }
        } catch(e) {
            console.error("Error in stream listener:", e);
        }
    }
  };

  Harness.prototype._enqueue = function (fn) {
    this._queue.push(fn);
    if (!this._running) {
      this._processQueue();
    }
  };

  Harness.prototype._processQueue = function () {
    this._running = true;
    var self = this;
    function nextTick() {
        if (self._queue.length > 0) {
            var task = self._queue.shift();
            try {
                task();
            } catch (e) {
                console.error("Error processing test queue:", e);
                self._addOutput("Bail out! Uncaught error during test setup/execution.");
                self._finalize(true);
                return;
            }
            setTimeout(nextTick, 0);
        } else {
            self._running = false;
            if (self._pendingTests === 0 && self._topLevelTests.length > 0) {
                self._finalize(self._totalFailed > 0);
            }
        }
    }
    setTimeout(nextTick, 0);
  };

  Harness.prototype.test = function (name, cb) {
    var test = new TestContext(name, this, null);
    this._topLevelTests.push(test);
    this._pendingTests++;
    
    // Support both immediate and manual run modes
    if (cb) {
      this._enqueue(function() {
        test._run(cb);
      });
    }
    
    return test;
  };

  TestContext.prototype.run = function() {
    if (this._cb) {
      this._harness._enqueue(() => {
        this._run(this._cb);
      });
    }
  };

  Harness.prototype._testEnded = function(test) {
      this._pendingTests--;
      this._totalAssertions += test._assertionCount;
      if (test._failed) {
          this._totalFailed++;
      }
      if (!this._running && this._pendingTests === 0 && this._queue.length === 0) {
          this._finalize(this._totalFailed > 0);
      }
  };

  Harness.prototype._finalize = function(failed) {
      if (this._finalized) return;
      this._finalized = true;

      this._addOutput("");
      this._addOutput("1.." + (this._assertionId - 1));
      this._addOutput("# tests " + (this._assertionId - 1));
      var passCount = (this._assertionId - 1) - this._totalFailed;
      this._addOutput("# pass " + passCount);
      if (this._totalFailed > 0) {
          this._addOutput("# fail " + this._totalFailed);
          this._emitter.emit("error", this._output.join("\n"));
      } else {
          this._addOutput("# ok");
          this._emitter.emit("finish", this._output.join("\n"));
      }
      this._emitter.emit("end");
  };

  Harness.prototype.onFinish = function (cb) {
    this._emitter.on("finish", cb);
  };

  Harness.prototype.onError = function (cb) {
    this._emitter.on("error", cb);
  };

  function SimpleStream(harness) {
      this._harness = harness;
      this._emitter = new EventEmitter();
      this._destination = null;
      this._objectMode = false;
  }
  SimpleStream.prototype.pipe = function(destination) {
      this._destination = destination;
      return this;
  };
  SimpleStream.prototype.on = function(event, listener) {
      if (event === 'data') {
          // Just pass through the line without adding newline
          this._harness._streamListeners.push(listener);
      } else if (event === 'end') {
           this._harness._emitter.on('end', listener);
      }
      return this;
  };

  Harness.prototype.createStream = function(options) {
      var stream = new SimpleStream(this);
      // Replay buffered output to new stream
      if (this._bufferedOutput.length > 0) {
          setTimeout(() => {
              this._bufferedOutput.forEach(line => {
                  stream._destination && stream._destination.write(line + '\n');
              });
          }, 0);
      }
      return stream;
  };

  function createHarness() {
    const harness = new Harness();
    // Expose test method directly on harness instance
    harness.test = function(name, cb) {
      const test = new TestContext(name, this, null);
      this._topLevelTests.push(test);
      this._pendingTests++;
      
      if (cb) {
        this._enqueue(function() {
          test._run(cb);
        });
      }
      
      return test;
    };
    return harness;
  }

  return {
    createHarness: createHarness,
    // Also expose TestContext for advanced usage if needed
    TestContext: TestContext,
    Harness: Harness
  };
})();

module.exports = TinyTestHarness;
