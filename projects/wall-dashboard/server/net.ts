import { BlockList, isIPv4 } from 'node:net';

// LAN-only: the API accepts writes, so a stray port-forward must not expose it.
// ponytail: fixed private ranges; make it configurable when a VPN range (e.g. 100.64/10) is needed
const lan = new BlockList();
for (const [net, bits] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8], // gitleaks:allow (RFC1918 range, not a host)
  ['172.16.0.0', 12], // gitleaks:allow (RFC1918 range, not a host)
  ['192.168.0.0', 16], // gitleaks:allow (RFC1918 range, not a host)
  ['169.254.0.0', 16],
] as const)
  lan.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const)
  lan.addSubnet(net, bits, 'ipv6');

export const isLan = (address = '') => {
  const ip = address.replace(/^::ffff:/, '');
  return lan.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
};
