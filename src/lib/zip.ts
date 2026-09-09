import zlib from "zlib";

// CRC32 table
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string; // e.g. "config.json" or "icons/icon16.png"
  data: Buffer | string;
}

/**
 * Creates a valid, zero-dependency ZIP archive Buffer using Node.js zlib
 */
export function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const entry of entries) {
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf-8");
    const nameBytes = Buffer.from(entry.name.replace(/\\/g, "/"), "utf-8");
    const crc = calculateCrc32(rawData);

    // Compress using DEFLATE
    const deflated = zlib.deflateRawSync(rawData);
    // If deflated is larger than raw, use STORE (uncompressed)
    const useDeflate = deflated.length < rawData.length;
    const compMethod = useDeflate ? 8 : 0;
    const compData = useDeflate ? deflated : rawData;

    // 1. Local File Header (30 bytes + name + compData)
    const localHdr = Buffer.alloc(30 + nameBytes.length);
    localHdr.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHdr.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHdr.writeUInt16LE(0, 6);          // Flags
    localHdr.writeUInt16LE(compMethod, 8); // Method
    localHdr.writeUInt16LE(dosTime, 10);   // Mod time
    localHdr.writeUInt16LE(dosDate, 12);   // Mod date
    localHdr.writeUInt32LE(crc, 14);       // CRC32
    localHdr.writeUInt32LE(compData.length, 18); // Compressed size
    localHdr.writeUInt32LE(rawData.length, 22);  // Uncompressed size
    localHdr.writeUInt16LE(nameBytes.length, 26);// Filename length
    localHdr.writeUInt16LE(0, 28);               // Extra field length
    nameBytes.copy(localHdr, 30);

    localHeaders.push(localHdr, compData);

    // 2. Central Directory Header (46 bytes + name)
    const cdHdr = Buffer.alloc(46 + nameBytes.length);
    cdHdr.writeUInt32LE(0x02014b50, 0); // Central dir signature
    cdHdr.writeUInt16LE(20, 4);         // Version made by
    cdHdr.writeUInt16LE(20, 6);         // Version needed
    cdHdr.writeUInt16LE(0, 8);          // Flags
    cdHdr.writeUInt16LE(compMethod, 10); // Method
    cdHdr.writeUInt16LE(dosTime, 12);   // Mod time
    cdHdr.writeUInt16LE(dosDate, 14);   // Mod date
    cdHdr.writeUInt32LE(crc, 16);       // CRC32
    cdHdr.writeUInt32LE(compData.length, 20); // Compressed size
    cdHdr.writeUInt32LE(rawData.length, 24);  // Uncompressed size
    cdHdr.writeUInt16LE(nameBytes.length, 28);// Filename length
    cdHdr.writeUInt16LE(0, 30);               // Extra field length
    cdHdr.writeUInt16LE(0, 32);               // Comment length
    cdHdr.writeUInt16LE(0, 34);               // Disk start
    cdHdr.writeUInt16LE(0, 36);               // Internal attrs
    cdHdr.writeUInt32LE(0, 38);               // External attrs
    cdHdr.writeUInt32LE(offset, 42);          // Local header offset
    nameBytes.copy(cdHdr, 46);

    centralHeaders.push(cdHdr);

    offset += localHdr.length + compData.length;
  }

  const centralDirBuffer = Buffer.concat(centralHeaders);
  const cdSize = centralDirBuffer.length;
  const cdOffset = offset;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // EOCD signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Start disk
  eocd.writeUInt16LE(entries.length, 8);   // Entries on this disk
  eocd.writeUInt16LE(entries.length, 10);  // Total entries
  eocd.writeUInt32LE(cdSize, 12);          // Central directory size
  eocd.writeUInt32LE(cdOffset, 16);        // Central directory offset
  eocd.writeUInt16LE(0, 20);               // Comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}
