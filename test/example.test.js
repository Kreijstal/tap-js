const test = require('../tiny-test-harness').createHarness();

test.test('Basic assertions', t => {
    t.equal(1, 1, 'numbers should be equal');
    t.equal('hello', 'hello', 'strings should be equal');
    t.deepEqual({a: 1}, {a: 1}, 'objects should be deeply equal');
    t.throws(() => { throw new Error('oops') }, 'should throw error');
    t.end();
});

test.test('Async test', t => {
    setTimeout(() => {
        t.pass('async test passed');
        t.end();
    }, 100);
});

test.onFinish(() => {
    console.log('All tests completed!');
});
