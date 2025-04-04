const _ = require('lodash');

// --- Debug Flag ---
// Set to true to enable detailed console logging from the harness itself.
const DEBUG_MODE = false;
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log('[DEBUG]', ...args);
  }
}

var TinyTestHarness = (function () {
  // --- Simple EventEmitter ---
  // Basic event emitter for signaling completion, compatible with most engines.
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
    this._outputBuffer = []; // Buffer for this test's direct output
    this.depth = parent ? parent.depth + 1 : 0; // Calculate nesting depth
    debugLog(`TestContext created: "${this.name}" (parent: ${parent ? `"${parent.name}"` : 'null'})`);

    // Output test start immediately according to TAP spec.
  }

  TestContext.prototype.on = function(event, listener) {
    this._emitter.on(event, listener);
    return this;
  };

  // Internal method to log TAP output via the harness.
  TestContext.prototype._log = function (message) {
    // Preserve all whitespace except trailing newlines
    const cleanMessage = message.replace(/\s+$/, '');
    this._outputBuffer.push(cleanMessage);
    debugLog(`Buffered (${this.name}, depth ${this.depth}): ${cleanMessage}`);
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
    debugLog(`Assertion ${result.id} (${this.name}): ${ok ? 'OK' : 'NOT OK'} - ${result.message}`);
    if (!ok) {
      this._failed = true; // Mark this test context as failed.
      debugLog(`Test "${this.name}" marked as failed due to assertion ${result.id}`);
      var current = this;
      while (current) {
        // Propagate failure status upwards to parent contexts.
        // Propagate failure upwards
        current._failed = true;
        current = current._parent;
      }
      // Log TAP output for a failing assertion.
      this._log("not ok " + result.id + " " + result.message);
      if (details) {
        // Log YAML block for failures with consistent indentation
        this._log("  ---");
        this._log("  operator: " + (details.operator || 'unknown'));
        if (details.hasOwnProperty("expected")) {
          this._log("  expected: " + JSON.stringify(details.expected));
        }
        if (details.hasOwnProperty("actual")) {
          this._log("  actual: " + JSON.stringify(details.actual));
        }
        if (details.error) {
            const stack = details.error.stack ? String(details.error.stack) : String(details.error);
            const indentedStack = stack.split('\n').map(line => '      ' + line).join('\n');
            this._log("  error: |");
            this._log(indentedStack);
        }
        this._log("  ...");
      }
    } else {
      // Log TAP output for a passing assertion.
      this._log("ok " + result.id + " " + result.message);
    }
    return result.ok; // Return boolean status.
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

  TestContext.prototype.notEqual = function (actual, expected, message) {
    var ok = actual !== expected;
    message = message || "should not be equal";
    return this._addResult(ok, message, {
      operator: "notEqual",
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

  TestContext.prototype.notDeepEqual = function (actual, expected, message) {
    var ok = !_.isEqual(actual, expected);
    message = message || "should not be deeply equal";
    return this._addResult(ok, message, {
      operator: "notDeepEqual",
      actual: actual,
      expected: expected
    });
  };

  // Assertion: checks if function `fn` throws an error.
  // `expectedError` can be undefined (any error), a constructor, a RegExp, or a string.
  // `message` is the description of the assertion.
  TestContext.prototype.doesNotThrow = function (fn, message) {
    var caught = null;
    try {
      fn();
    } catch (e) {
      caught = e;
    }
    var ok = !caught;
    message = message || "should not throw";
    return this._addResult(ok, message, {
      operator: "doesNotThrow",
      error: caught
    });
  };

  TestContext.prototype.throws = function (fn, expectedError, message) {
      var caught = null;
      var ok = false;
      // If only two arguments are provided, the second is the message.
      if (typeof expectedError === 'string' && message === undefined) {
          message = expectedError;
          expectedError = undefined; // Indicate any error is acceptable.
      }
      message = message || 'should throw';
      debugLog(`throws (${this.name}): Running function. Expecting error? ${expectedError !== undefined ? String(expectedError) : 'Any'}`);

      try {
          fn(); // Execute the function under test.
      } catch (e) {
          caught = e; // Capture the thrown error.
          debugLog(`throws (${this.name}): Caught error:`, e);
      }

      if (caught) {
          // An error was caught, now check if it matches expectations.
          if (expectedError === undefined) {
              // Any error is okay if none specified.
              debugLog(`throws (${this.name}): No expected error specified, caught one. OK.`);
              ok = true;
          } else if (typeof expectedError === 'function' && caught instanceof expectedError) {
              // Check if error is instance of expected constructor.
              debugLog(`throws (${this.name}): Caught error is instance of ${expectedError.name}. OK.`);
              ok = true;
          } else if (expectedError instanceof RegExp && expectedError.test(String(caught.message || caught))) {
              // Check if error message matches RegExp.
              debugLog(`throws (${this.name}): Caught error message matches RegExp ${expectedError}. OK.`);
              ok = true;
          } else if (typeof expectedError === 'string' && String(caught.message || caught).indexOf(expectedError) !== -1) {
              // Check if error message contains expected string.
              debugLog(`throws (${this.name}): Caught error message contains string "${expectedError}". OK.`);
              ok = true;
          } else {
              debugLog(`throws (${this.name}): Caught error does not match expectation: ${String(expectedError)}`);
          }
      } else {
          // No error was caught.
          debugLog(`throws (${this.name}): Function did not throw.`);
      }

      // Prepare details for TAP output on failure.
      var details = { operator: 'throws', actual: caught };
      if (expectedError !== undefined) {
          // Correctly report the *expected* error condition, not the assertion message.
          details.expected = String(expectedError);
      }
      if (!ok) {
          // If the check failed, include the caught error (or a "did not throw" error) in details.
          details.error = caught || new Error('Function did not throw');
      }

      debugLog(`throws (${this.name}): Final result: ${ok ? 'OK' : 'NOT OK'}. Message: "${message}"`);
      return this._addResult(ok, message, details);
  };

  TestContext.prototype.test = function (name, cb) {
    if (this._ended) {
        throw new Error("Cannot call t.test() after t.end()");
    }
    var child = new TestContext(name, this._harness, this);
    this._children.push(child);
    this._pendingChildren++;
    debugLog(`Sub-test scheduled: "${name}" (parent: "${this.name}"). Pending children for "${this.name}": ${this._pendingChildren}`);
    // Enqueue the child test to run after the current synchronous flow completes.
    this._harness._enqueue(function () {
      child._run(cb);
    });
  };

  // Internal method to execute the test function.
  TestContext.prototype._run = function (cb) {
    var self = this;
    var syncError = null; // Track sync errors
    debugLog(`Running test: "${self.name}"`);
    try {
      cb(self); // Execute the user's test function with the context (t).
    } catch (e) {
      syncError = e; // Capture sync error
      // Handle synchronous errors thrown directly by the test function.
      debugLog(`Error thrown synchronously in test "${self.name}":`, e);
      self._addResult(false, "test function threw synchronously: " + e.message, {
          operator: 'error', // Indicates an uncaught error during test execution.
          actual: e,
          error: e // Include the error object in details.
      });
      // If the test function crashes, end the test immediately.
      // This end() call will finalize immediately as there are no pending ops yet.
      self.end();
    }
    // If the test function completed without throwing synchronously,
    // call end() implicitly. This allows tests with only sub-tests or async ops
    // to correctly signal they are waiting for completion.
    if (!syncError) {
        debugLog(`_run (${self.name}): Test function finished synchronously. Calling end() implicitly.`);
        // This end() will set _waitingToEnd if children/async are pending,
        // or finalize immediately if not.
        self.end();
    }
  };

  TestContext.prototype.end = function () {
    if (this._ended) {
      debugLog(`end (${this.name}): Already ended.`);
      return;
    }
    debugLog(`end (${this.name}): Called. Pending children: ${this._pendingChildren}, Pending async: ${this._pendingAsync}`);
    // If there are outstanding asynchronous operations or child tests,
    // defer the actual end logic until they complete.
    if (this._pendingChildren > 0 || this._pendingAsync > 0) {
      this._waitingToEnd = true;
      debugLog(`end (${this.name}): Waiting for ${this._pendingChildren} children and ${this._pendingAsync} async ops.`);
      return;
    }

    if (this._plan !== null && this._plan !== this._assertionCount) {
      this._addResult(false, "plan != count", {
          operator: 'plan',
          expected: this._plan,
          actual: this._assertionCount
      });
    }

    debugLog(`end (${this.name}): Finalizing.`);
    this._ended = true; // Mark as ended to prevent further actions.

    // Check plan vs actual assertion count if a plan was set.
    if (this._plan !== null && this._plan !== this._assertionCount) {
      this._addResult(false, "plan != count", {
          operator: 'plan',
          expected: this._plan,
          actual: this._assertionCount
      });
    }


    if (this._failed) {
      // Emit an error event if this test or its children failed (optional, for programmatic use).
      // Note: This is not standard TAP behavior.
      // this._emitter.emit('error', new Error(`Test "${this.name}" failed`));
      debugLog(`end (${this.name}): Test failed.`);
    } else {
      debugLog(`end (${this.name}): Test passed.`);
    }

    // Notify parent or harness that this test has completed.
    if (this._parent) {
      debugLog(`end (${this.name}): Notifying parent "${this._parent.name}"`);
      this._parent._childEnded(this);
    } else {
      // This is a top-level test.
      debugLog(`end (${this.name}): Notifying harness.`);
      this._harness._testEnded(this);
    }
  };

  // Method for tests to signal completion of an asynchronous operation.
  // Must be paired with an initial increment of `_pendingAsync`.
  TestContext.prototype.done = function() {
    debugLog(`done (${this.name}): Async operation finished. Decrementing pending count.`);
    this._pendingAsync--;
    if (this._pendingAsync < 0) {
      // Should not happen if used correctly, but prevent negative counts.
      console.error(`INTERNAL WARNING (${this.name}): _pendingAsync went negative.`);
      this._pendingAsync = 0;
    }
    debugLog(`done (${this.name}): Pending async count now: ${this._pendingAsync}`);
    // If the test was waiting to end, check if all conditions are now met.
    if (this._waitingToEnd && this._pendingChildren === 0 && this._pendingAsync === 0) {
      debugLog(`done (${this.name}): All pending operations finished while waiting to end. Calling end() now.`);
      this.end(); // Trigger the deferred end logic.
    }
  };

  // Internal callback when a child test context finishes.
  TestContext.prototype._childEnded = function (child) {
    debugLog(`_childEnded (${this.name}, depth ${this.depth}): Child "${child.name}" (depth ${child.depth}) ended. Failed: ${child._failed}`);

    // 1. Log the subtest comment
    this._log(`# Subtest: ${child.name}`);

    // 2. Flush child's buffer with proper indentation
    const childIndent = '    '.repeat(child.depth - 1); // Parent handles base indentation
    child._outputBuffer.forEach(line => {
        // Skip empty lines
        if (!line) return;
        // Indent based on child's depth
        this._log(childIndent + line);
    });

    // 3. Generate and log the correlated test point
    const childResultOk = !child._failed;
    this._addResult(childResultOk, child.name, {
        operator: 'subtest'
    });

    // 4. Decrement pending count and check if parent can end
    this._pendingChildren--;
    if (this._pendingChildren < 0) {
        console.error(`INTERNAL ERROR (${this.name}): Pending children count went negative.`);
        this._pendingChildren = 0;
    }
    debugLog(`_childEnded (${this.name}): Pending children count now: ${this._pendingChildren}`);
    if (this._waitingToEnd && this._pendingChildren === 0 && this._pendingAsync === 0) {
        debugLog(`_childEnded (${this.name}): All pending operations finished while waiting to end. Calling end() now.`);
        this.end();
    }
  };

  // --- Harness ---
  function Harness() {
    this._output = ["TAP version 14"]; // Initialize with version line
    this._queue = [];
    this._running = false;
    this._assertionId = 1;
    this._topLevelTests = [];
    this._pendingTests = 0;
    this._totalAssertions = 0;
    this._totalFailed = 0;
    this._emitter = new EventEmitter();
    this._streamListeners = [];
    this._headerWritten = false;
    debugLog("Harness created with TAP version in output buffer");
  }

  // Register event listeners on the harness (e.g., 'finish', 'error', 'end').
  Harness.prototype.on = function(event, listener) {
    this._emitter.on(event, listener);
    return this;
  };

  Harness.prototype._addOutput = function (line) {
    // Ensure we have a string and trim only trailing whitespace
    const cleanLine = String(line).replace(/\s+$/, '');
    if (!cleanLine) return; // Skip empty lines
    
    this._output.push(cleanLine);
    
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

  // Add a test function (or other task) to the execution queue.
  Harness.prototype._enqueue = function (fn) {
    debugLog(`_enqueue: Adding task to queue. Queue size: ${this._queue.length + 1}`);
    this._queue.push(fn);
    // If the queue processor isn't currently running, start it.
    if (!this._running) {
      debugLog("_enqueue: Queue not running, starting processor.");
      this._processQueue();
    }
  };

  // Process the queue of test functions asynchronously.
  Harness.prototype._processQueue = function () {
    if (this._running) {
        debugLog("_processQueue: Already running.");
        return; // Avoid concurrent processing loops.
    }
    debugLog("_processQueue: Starting run.");
    this._running = true;
    var self = this;

    function nextTick() {
        debugLog(`_processQueue.nextTick: Queue length: ${self._queue.length}, Pending tests: ${self._pendingTests}`);
        if (self._queue.length > 0) {
            // Get the next task (typically running a test function).
            var task = self._queue.shift();
            debugLog("_processQueue.nextTick: Dequeued task.");
            try {
                task(); // Execute the task (e.g., test._run(cb)).
            } catch (e) {
                // Catastrophic error during task execution (should ideally be caught within TestContext._run).
                console.error("FATAL: Error processing test queue:", e);
                self._addOutput("Bail out! Uncaught error during test execution.");
                // Attempt to finalize immediately, marking as failed.
                self._finalize(true); // Pass true for failure.
                return; // Stop processing.
            }
            // Yield to the event loop before processing the next task.
            // This allows I/O, timers, etc., to run between test initializations.
            setTimeout(nextTick, 0);
        } else {
            // Queue is empty.
            debugLog("_processQueue.nextTick: Queue empty.");
            self._running = false; // Mark processor as stopped.
            // Check if all top-level tests have finished *and* the queue is empty.
            // This is a potential condition for finalization.
            if (self._pendingTests === 0 && self._topLevelTests.length > 0) {
                debugLog("_processQueue.nextTick: Queue empty and no pending tests. Finalizing.");
                self._finalize(self._totalFailed > 0);
            } else {
                 debugLog(`_processQueue.nextTick: Queue empty but ${self._pendingTests} tests still pending.`);
            }
        }
    }
    // Start the processing loop, yielding first.
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
    } else {
        debugLog(`Test created but not scheduled immediately: "${name}" (use test.run())`);
    }
    
    return test; // Return the TestContext instance.
  };

  // Manually enqueue and run a test that was created without a callback.
  TestContext.prototype.run = function() {
    // Note: The original implementation stored the callback on `this._cb`.
    // This seems missing in the provided code. Assuming the callback was passed
    // during creation but not immediately enqueued. Let's refine the main `test` method.
    // For now, this method might not work as intended without `this._cb`.
    // Let's assume the user calls harness.test(name) then test.run(cb).
    // A better pattern might be needed here.
    // *** Revision needed based on intended usage pattern ***
    // If the intent is harness.test(name, cb) OR harness.test(name) then test.run(),
    // the callback needs storing. Let's adjust the main `test` method slightly.

    // Assuming _cb exists (needs fix in harness.test or createHarness):
    if (this._cb) {
        debugLog(`run (${this.name}): Manually enqueuing test.`);
        this._harness._enqueue(() => {
            this._run(this._cb);
        });
    } else {
        console.error(`WARNING (${this.name}): test.run() called but no callback function available.`);
    }
  };

  // Internal callback when a top-level test context finishes.
  Harness.prototype._testEnded = function(test) {
      debugLog(`_testEnded: Top-level test "${test.name}" ended. Failed: ${test._failed}`);

      // Add subtest header (no indentation for top-level)
      this._addOutput(`# Subtest: ${test.name}`);

      // Flush test's buffer with proper indentation
      test._outputBuffer.forEach(line => {
          this._addOutput(line);
      });

      // Add final test point (no indentation)
      const assertionId = this._assertionId++;
      const line = (!test._failed ? 'ok ' : 'not ok ') + assertionId + ' - ' + test.name;
      this._addOutput(line);

      this._pendingTests--;
      if (test._failed) {
          this._totalFailed++;
          debugLog(`_testEnded: Total failed count incremented to ${this._totalFailed}`);
      }
      debugLog(`_testEnded: Pending top-level tests remaining: ${this._pendingTests}`);

      if (this._pendingTests === 0 && !this._running && this._queue.length === 0) {
          debugLog("_testEnded: Last test ended and queue is idle. Finalizing.");
          this._finalize(this._totalFailed > 0);
      } else {
          debugLog(`_testEnded: Not finalizing yet. Running: ${this._running}, Pending Tests: ${this._pendingTests}, Queue Length: ${this._queue.length}`);
      }
  };

  // Finalize the test run, print summary, and emit completion events.
  Harness.prototype._finalize = function(failed) {
      debugLog(`_finalize: Called. Failed status: ${failed}. Finalized already? ${this._finalized}`);
      // Prevent multiple finalizations.
      if (this._finalized) return;
      this._finalized = true;
      debugLog("_finalize: Marked as finalized.");

      // Use setTimeout to ensure this runs after any currently pending microtasks or I/O callbacks.
      // This helps ensure all test output has been generated before the summary.
      // A small delay like 10ms might still be brittle; 0ms is often sufficient.
      setTimeout(() => {
        debugLog("_finalize (in timeout): Generating final TAP summary.");
        const totalAssertions = this._assertionId - 1; // Assertion IDs start at 1.
        this._addOutput(""); // Blank line before summary.
        this._addOutput("1.." + totalAssertions); // TAP plan line.
        this._addOutput("# tests " + totalAssertions); // Total assertions executed.
        var passCount = totalAssertions - this._totalFailed;
        this._addOutput("# pass " + passCount); // Total passing assertions.
        if (this._totalFailed > 0) {
            this._addOutput("# fail " + this._totalFailed); // Total failing assertions.
        } else {
            this._addOutput("# ok"); // Overall status indicator (optional but common).
        }
        this._addOutput(""); // Blank line after summary.
        // Optional: Add a human-readable summary line.
        // this._addOutput("# All tests completed!");

        debugLog(`_finalize (in timeout): Emitting events. Failed: ${failed}`);
        // Emit 'finish' or 'error' based on the overall result.
        // Pass the full TAP output string to listeners.
        this._emitter.emit(failed ? "error" : "finish", this._output.join("\n"));
        // Emit 'end' event to signal stream completion.
        this._emitter.emit("end");
        debugLog("_finalize (in timeout): Events emitted.");
      }, 0); // Use 0ms delay, usually sufficient for event loop tick.
  };

  Harness.prototype.onFinish = function (cb) {
    this._emitter.on("finish", cb);
  };

  Harness.prototype.onError = function (cb) {
    this._emitter.on("error", cb);
  };

  function SimpleStream(harness) {
      debugLog("Creating new SimpleStream");
      this._harness = harness;
      this._emitter = new EventEmitter();
      this._destination = null;
  }
  
  SimpleStream.prototype.pipe = function(destination) {
      this._destination = destination;
      // Write all existing output to the destination
      this._harness._output.forEach(line => {
          destination.write(line + '\n');
      });
      // Add a writer for future output
      const writer = (line) => destination.write(line + '\n');
      this._harness._streamListeners.push(writer);
      return destination;
  };
  
  SimpleStream.prototype.on = function(event, listener) {
      if (event === 'data') {
          // Replay existing output
          this._harness._output.forEach(line => listener(line));
          // Add listener for future output
          this._harness._streamListeners.push(listener);
      } else if (event === 'end') {
          this._harness._emitter.on('end', listener);
      }
      return this;
  };

  Harness.prototype.createStream = function(options) {
      debugLog("createStream called");
      var stream = new SimpleStream(this);
      
      // Write all buffered output to new stream
      for (var i = 0; i < this._output.length; i++) {
          const line = this._output[i];
          for (var j = 0; j < this._streamListeners.length; j++) {
              try {
                  this._streamListeners[j](line);
                  if (this._streamListeners[j]._destination) {
                      this._streamListeners[j]._destination.write(line + '\n');
                  }
              } catch(e) {
                  console.error("Error writing to listener:", e);
              }
          }
      }
      
      return stream;
  };

  function createHarness() {
    const harness = new Harness();
    // Expose the primary 'test' method directly on the harness instance
    // for the common case: harness.test(...)
    harness.test = function(name, cb) {
      // Create a top-level test context (no parent).
      const test = new TestContext(name, this, null);
      // Store the callback on the test context in case test.run() is used later.
      // This addresses the potential issue noted in TestContext.prototype.run.
      test._cb = cb;
      this._topLevelTests.push(test);
      this._pendingTests++;
      debugLog(`harness.test: Created top-level test "${name}". Pending tests: ${this._pendingTests}`);

      // If a callback is provided, enqueue it for immediate (asynchronous) execution.
      if (cb) {
        debugLog(`harness.test: Enqueuing immediate run for "${name}"`);
        this._enqueue(function() {
          // We need the 'test' instance inside the closure.
          const currentTest = test;
          currentTest._run(currentTest._cb);
        });
      } else {
        // If no callback, the user must call test.run() later.
        debugLog(`harness.test: Test "${name}" created without callback. Manual run required.`);
      }

      return test; // Return the TestContext instance.
    };
    debugLog("createHarness: Harness instance created and configured.");
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
