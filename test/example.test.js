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
    t.equal(1, 2, 'this number comparison should fail'); // <--- ADD A FAILING ASSERTION
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
    setTimeout(() => {
      resolve(output);
    }, 100); // Extra delay to ensure all output is flushed
  });
  
  test.on('error', (err) => {
    //console.error(err);
    console.error("\nTest suite failed."); 
    process.exit(1);
  });
});

// Run tests
// t.run(); // No longer needed - harness.test() enqueues automatically when callback is provided

// Keep process alive until tests complete
testPromise.catch(err => {
  //console.error(err);
  process.exit(1);
});

// Export promise for async test runners
module.exports = testPromise;
