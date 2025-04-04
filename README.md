# Tiny Test Harness

A minimal JavaScript test harness with TAP-like output, designed for simplicity and async support.

## Installation

```bash
npm install tiny-test-harness
```

## Basic Usage

```javascript
const { createHarness } = require('tiny-test-harness');
const test = createHarness();

test.test('Basic assertions', (t) => {
  t.equal(1, 1, 'numbers should be equal');
  t.deepEqual({a: 1}, {a: 1}, 'objects should match');
  t.throws(() => { throw new Error() }, 'should throw');
  t.end();
});
```

## Async Tests

```javascript
test.test('Async test', (t) => {
  t._pendingAsync++; // Mark async operation start
  
  setTimeout(() => {
    t.pass('async test passed');
    t.done(); // Mark async operation complete
    t.end();
  }, 100);
});
```

## Assertions

Available assertion methods:
- `t.equal(actual, expected, message)`
- `t.deepEqual(actual, expected, message)`
- `t.throws(fn, expectedError, message)`
- `t.pass(message)`
- `t.fail(message)`

## Test Structure

- Tests can be nested using `t.test()`
- Each test must call `t.end()` when complete
- Async tests should increment `t._pendingAsync` and call `t.done()`

## Output Handling

```javascript
let output = '';
test.createStream().on('data', (row) => {
  output += row + '\n';
  console.log(row);
});

test.on('finish', () => {
  console.log('All tests completed');
});
```

## Features

- Simple TAP-like output
- Nested test support
- Async test support
- Lightweight (~5kb minified)
- No external dependencies

## License

MIT
