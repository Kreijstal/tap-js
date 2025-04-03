const test = require('../tiny-test-harness').createHarness();

console.log('Test harness created');

test.test('Basic assertions', t => {
    console.log('Basic assertions test started');
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.throws(() => { throw new Error('oops') }, 'should throw error');
    console.log('Basic assertions calling end()');
    t.end();
    console.log('Basic assertions after end()');
});

test.test('Async test', t => {
    console.log('Async test started');
    t._pendingAsync++; // Mark async operation start
    console.log('Pending async count:', t._pendingAsync);
    
    setTimeout(() => {
        console.log('Async timeout fired');
        t.pass('async test passed');
        console.log('Calling done()');
        t.done(); // Mark async operation complete
        console.log('Pending async count after done():', t._pendingAsync);
        console.log('Calling end()');
        t.end();
        console.log('After end()');
    }, 100);
    
    console.log('Async test setup complete');
});

test.onFinish(() => {
    console.log('All tests completed!');
});

console.log('All tests registered');
