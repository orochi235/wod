import '@testing-library/jest-dom/vitest'

// jsdom 25's Blob implements only slice/size/type — no text(), arrayBuffer(),
// or stream(). Blob.text() is browser baseline, so the gap belongs to the test
// environment, not to the code under test. FileReader is implemented, so the
// shim reads through that.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
