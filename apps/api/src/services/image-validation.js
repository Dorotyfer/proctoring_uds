export function isJpegBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
    && buffer.at(-2) === 0xff
    && buffer.at(-1) === 0xd9;
}
