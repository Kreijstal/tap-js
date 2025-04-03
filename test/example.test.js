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
      t.done(); // Mark async operation complete
      // Don't call t.end() here - let the parent test end naturally
    }, 100);
  });
});

// Handle completion
const testPromise = new Promise((resolve, reject) => {
  test.on('finish', () => {
    console.log('All tests completed!');
    resolve(output);
  });
  
  test.on('error', (err) => {
    reject(err);
  });
});

// Run tests
t.run();

// Keep process alive until tests complete
testPromise.then(() => {
  // Add slight delay to ensure all output is flushed
  setTimeout(() => {
    console.log('\nAll tests completed!');
  }, 10);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

// Export promise for async test runners
module.exports = testPromise;
