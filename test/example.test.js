const test = require('../tiny-test-harness').createHarness();

// Create and pipe stream immediately 
test.createStream().pipe(process.stdout);

test.test('Basic assertions', t => {
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.throws(() => { throw new Error('oops') }, 'should throw error');
    t.end();
});

test.test('Async test', t => {
    t._pendingAsync++; // Mark async operation start
    
    setTimeout(() => {
        t.pass('async test passed');
        t.done(); // Mark async operation complete
        t.end();
    }, 100);
});

test.onFinish(() => {
    // This will appear after TAP output
    console.error('All tests completed!');
});
