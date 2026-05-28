export const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"


// Танзимоти серверҳои WebRTC ICE (STUN/TURN) барои пайвасти мустақими P2P.
// Дар оянда, вақте ки шумо барномаро ба VPS мегузаронед, метавонед маълумоти сервери Coturn-и худро дар ин ҷо илова кунед:
export const ICE_SERVERS = [
  // Серверҳои ройгони STUN аз Google (барои ёфтани суроғаи IP-и оммавӣ)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  
  /*
  // Намунаи танзими сервери TURN (барои реле кардани трафик вақте ки STUN кор намекунад):
  {
    urls: "turn:your-vps-domain-or-ip.com:3478?transport=udp",
    username: "messenger_user",
    credential: "your_secure_password"
  },
  {
    urls: "turn:your-vps-domain-or-ip.com:3478?transport=tcp",
    username: "messenger_user",
    credential: "your_secure_password"
  }
  */
]