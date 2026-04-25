import sharp from 'sharp'

const [, , input, output, quality] = process.argv
await sharp(input).webp({ quality: Number(quality) || 95 }).toFile(output)
