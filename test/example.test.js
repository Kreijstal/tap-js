const test = require('../tiny-test-harness').createHarness();

console.error('DEBUG: Test harness created');

// Create and pipe stream immediately 
const stream = test.createStream().pipe(process.stdout);
console.error('DEBUG: Stream created and piped');

test.test('Basic assertions', t => {
    console.error('DEBUG: Basic assertions test started');
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.throws(() => { throw new Error('oops') }, 'should throw error');
    console.error('DEBUG: Basic assertions calling end()');
    t.end();
    console.error('DEBUG: Basic assertions after end()');
});

test.test('Async test', t => {
    console.error('DEBUG: Async test started');
    t._pendingAsync++; // Mark async operation start
    console.error('DEBUG: Pending async count:', t._pendingAsync);
    
    setTimeout(() => {
        console.error('DEBUG: Async timeout fired');
        t.pass('async test passed');
        console.error('DEBUG: Calling done()');
        t.done();
        console.error('DEBUG: Calling end()');
        t.end();
    }, 100);
});

test.onFinish(() => {
    console.error('DEBUG: All tests completed!');
});

console.error('DEBUG: All tests registered');
