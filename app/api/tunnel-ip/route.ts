export async function GET() {
  const res = await fetch('https://loca.lt/mytunnelpassword')
  const ip = await res.text()
  return new Response(ip.trim())
}
