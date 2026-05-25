// Pre-V2 we hard-code the LAN IP. In V2 this comes from EAS Build config.
// To change: get fresh IP with `ipconfig getifaddr en0` (Wi-Fi) or `en1` (Ethernet).
export const API_BASE_URL = 'http://192.168.50.176:4000';
