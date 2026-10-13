/**
 * WebRTC ICE Server Configuration Provider
 */

export function getIceServers() {
  const stunServersRaw = process.env.RTC_STUN_SERVERS || 
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302,stun:stun.cloudflare.com:3478';
  const iceServers = stunServersRaw
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
    .map(url => ({ urls: url }));

  // If TURN credentials are provided, append TURN server(s)
  if (process.env.RTC_TURN_SERVER) {
    const turnUrls = process.env.RTC_TURN_SERVER
      .split(',')
      .map(url => url.trim())
      .filter(Boolean);

    if (turnUrls.length > 0) {
      const turnConfig = {
        urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      };
      if (process.env.RTC_TURN_USERNAME) {
        turnConfig.username = process.env.RTC_TURN_USERNAME;
      }
      if (process.env.RTC_TURN_CREDENTIAL) {
        turnConfig.credential = process.env.RTC_TURN_CREDENTIAL;
      }
      iceServers.push(turnConfig);
    }
  }

  return iceServers;
}
