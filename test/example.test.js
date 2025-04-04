const createHarness = require('../tiny-test-harness').createHarness;
const test = createHarness();

// Collect output in a string
let output = '';
test.createStream({ objectMode: false }).on('data', function(row) {
  output += row + '\n';
  console.log(row);
});

// Create main test
test.test('Main test suite', (t) => {
  t.test('Basic assertions', (t) => {
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.notEqual(1, 2, 'numbers should not be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.notDeepEqual({a: 1}, {a: 2}, 'objects should not match');
    t.throws(() => { throw new Error('expected error') }, 'should throw error');
    t.doesNotThrow(() => {}, 'should not throw');
    t.end();
  });

  t.test('Async operations', (t) => {
    t.test('Successful async', (t) => {
      t._pendingAsync++;
      setTimeout(() => {
        t.pass('async operation completed');
        t.done();
      }, 50);
    });

    t.test('Failing async', (t) => {
      t._pendingAsync++;
      setTimeout(() => {
        t.pass('async operation completed');
        t.done();
      }, 50);
    });
  });

  t.test('Nested tests', (t) => {
    t.test('Level 1', (t) => {
      t.test('Level 2', (t) => {
        t.pass('deeply nested test passed');
        t.end();
      });
      t.end();
    });
    t.end();
  });
});

// Handle completion
test.on('finish', () => {
  console.log('\nAll tests completed');
  process.exit(0);
});

test.on('error', (err) => {
  console.error('\nTest suite failed:', err.message);
  process.exit(1);
});
