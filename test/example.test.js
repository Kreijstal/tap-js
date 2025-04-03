const createHarness = require('../tiny-test-harness').createHarness;
const test = createHarness();

// Collect output in a string
let output = '';
test.createStream({ objectMode: false }).on('data', function(row) {
  output += row + '\n';
  console.log(row);
});

// Create main test
const t = test.test('Main test suite', (t) => {
  t.test('Basic assertions', (t) => {
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.throws(() => { throw new Error('oops') }, 'should throw error');
    t.end();
  });

  t.test('Async test', (t) => {
    t._pendingAsync++; // Mark async operation start
    
    setTimeout(() => {
      t.pass('async test passed');
      t.done();
      t.end();
    }, 100);
  });
});

// Handle completion
const testPromise = new Promise((resolve, reject) => {
  test.onFinish(() => {
    console.log('All tests completed!');
    resolve(output);
  });
  
  // Listen for errors on both the test and harness
  const errorHandler = (err) => {
    reject(err);
  };
  t.on('error', errorHandler);
  test.on('error', errorHandler);
});

// Run tests
t.run();

// Export promise for async test runners
module.exports = testPromise;
