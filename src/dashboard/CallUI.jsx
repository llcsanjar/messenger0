import React, { useEffect, useRef, useState } from "react"
import "./CallUI.css"
import { ICE_SERVERS } from "../config"

const iceServers = ICE_SERVERS

// Web Audio API tone generator class for premium offline sounds
class CallAudioController {
  constructor() {
    this.ctx = null
    this.interval = null
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
  }

  playDialTone() {
    this.init()
    this.stop()
    this.interval = setInterval(() => {
      try {
        if (this.ctx.state === "suspended") {
          this.ctx.resume()
        }
        const now = this.ctx.currentTime
        const o1 = this.ctx.createOscillator()
        const o2 = this.ctx.createOscillator()
        const g = this.ctx.createGain()
        
        o1.type = "sine"
        o2.type = "sine"
        o1.frequency.setValueAtTime(425, now)
        o2.frequency.setValueAtTime(425, now)
        
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(0.08, now + 0.1)
        g.gain.setValueAtTime(0.08, now + 1.0)
        g.gain.linearRampToValueAtTime(0, now + 1.2)
        
        o1.connect(g)
        o2.connect(g)
        g.connect(this.ctx.destination)
        
        o1.start(now)
        o2.start(now)
        o1.stop(now + 1.2)
        o2.stop(now + 1.2)
      } catch (e) {
        console.error("Dial tone playback error:", e)
      }
    }, 3000)
  }

  playRingTone() {
    this.init()
    this.stop()
    this.interval = setInterval(() => {
      try {
        if (this.ctx.state === "suspended") {
          this.ctx.resume()
        }
        const now = this.ctx.currentTime
        const o1 = this.ctx.createOscillator()
        const o2 = this.ctx.createOscillator()
        const g = this.ctx.createGain()
        
        o1.frequency.setValueAtTime(440, now)
        o2.frequency.setValueAtTime(480, now)
        
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(0.12, now + 0.1)
        g.gain.setValueAtTime(0.12, now + 1.0)
        g.gain.linearRampToValueAtTime(0, now + 1.2)
        
        o1.connect(g)
        o2.connect(g)
        g.connect(this.ctx.destination)
        
        o1.start(now)
        o2.start(now)
        o1.stop(now + 1.2)
        o2.stop(now + 1.2)
      } catch (e) {
        console.error("Ringtone playback error:", e)
      }
    }, 2000)
  }

  playEndTone() {
    try {
      this.init()
      this.stop()
      if (this.ctx.state === "suspended") {
        this.ctx.resume()
      }
      const now = this.ctx.currentTime
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.frequency.setValueAtTime(250, now)
      
      g.gain.setValueAtTime(0.08, now)
      g.gain.linearRampToValueAtTime(0, now + 0.35)
      
      o.connect(g)
      g.connect(this.ctx.destination)
      o.start(now)
      o.stop(now + 0.35)
    } catch (e) {
      console.error("End tone playback error:", e)
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}

export default function CallUI({ session, ws, myEmail, onCallEnd, t }) {
  // session details: { type: 'outgoing' | 'incoming', callType: 'voice' | 'video', peer: { _id, email, name, photo } }
  
  const [callState, setCallState] = useState(session.type === "outgoing" ? "initiating" : "incoming")
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false)

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)

  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const audioControllerRef = useRef(new CallAudioController())
  const iceCandidatesQueueRef = useRef([])
  const isDescriptionSetRef = useRef(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const durationTimerRef = useRef(null)
  const callTimeoutRef = useRef(null)

  const hasAutoCameraOffRef = useRef(false)

  useEffect(() => {
    if (session.callType === "voice" && callState === "active" && localStreamRef.current && !hasAutoCameraOffRef.current) {
      
      hasAutoCameraOffRef.current = true
      
      // Агар камера ҳоло хомӯш набошад, онро хомӯш кун
      if (!isVideoOff) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = false
        })
        setIsVideoOff(true)
        
        // Огоҳии remote peer
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "camera_toggle",
            receiver_id: session.peer._id,
            sender_email: myEmail,
            enabled: false
          }))
        }
      }
    }
  }, [session.callType, callState, localStreamRef.current, isVideoOff, ws, session.peer._id, myEmail])

  useEffect(() => {
    return () => {
      hasAutoCameraOffRef.current = false
    }
  }, [])

  // Track elapsed call time
  useEffect(() => {
    if (callState === "active") {
      durationTimerRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current)
      }
    }
    return () => clearInterval(durationTimerRef.current)
  }, [callState])

  // Bind local stream to video element when active state renders
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream, callState])

  // Bind remote stream to video element when active state renders
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream, callState])

  // Setup sound controllers and trigger dialing/ringing
  useEffect(() => {
    if (callState === "initiating") {
      audioControllerRef.current.playDialTone()
      // Timeout after 30 seconds if no answer
      callTimeoutRef.current = setTimeout(() => {
        handleCallTimeout()
      }, 30000)
    } else if (callState === "incoming") {
      audioControllerRef.current.playRingTone()
    }

    return () => {
      audioControllerRef.current.stop()
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
      }
    }
  }, [callState])

  // Get user media and set up peer connection
  const initLocalStream = async () => {
    try {
      const constraints = {
        audio: true,
        video: true
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (error) {
      console.error("Error accessing user media:", error)
      alert(t?.media_access_error || "Камера ё микрофон дастрас нест!")
      handleHangUp(false, "rejected")
      return null
    }
  }

  // Create Peer Connection
  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection({ iceServers })
    peerConnectionRef.current = pc

    // Add local tracks to RTCPeerConnection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream)
    })

    // Listen for remote streams
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }
    }

    // Exchange ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "ice_candidate",
          receiver_id: session.peer._id,
          sender_email: myEmail,
          candidate: event.candidate
        }))
      }
    }

    return pc
  }

  // Caller side: start outgoing call and acquire mic/camera
  useEffect(() => {
    if (session.type === "outgoing") {
      const startOutgoingCall = async () => {
        const stream = await initLocalStream()
        if (!stream) return

        // Create P2P Connection
        createPeerConnection(stream)

        // Send WS call initiation request
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "call_initiate",
            call_type: session.callType,
            sender_email: myEmail,
            receiver_id: session.peer._id
          }))
        }
      }
      startOutgoingCall()
    }
  }, [])

  // Process incoming socket signaling messages
  useEffect(() => {
    if (!ws) return

    const handleSignalingMessage = async (event) => {
      const data = JSON.parse(event.data)

      if (data.type === "call_accepted") {
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current)
        }
        audioControllerRef.current.stop()
        setCallState("active")

        // Caller side creates WebRTC Offer
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            ws.send(JSON.stringify({
              type: "webrtc_offer",
              receiver_id: session.peer._id,
              sender_email: myEmail,
              sdp: offer
            }))
          } catch (e) {
            console.error("Error creating WebRTC offer:", e)
          }
        }
      }

      else if (data.type === "call_rejected") {
        audioControllerRef.current.stop()
        audioControllerRef.current.playEndTone()
        setCallState("rejected")
        cleanupMedia()
        setTimeout(() => {
          onCallEnd(false)
        }, 2000)
      }

      else if (data.type === "call_ended") {
        audioControllerRef.current.stop()
        audioControllerRef.current.playEndTone()
        setCallState("ended")
        cleanupMedia()
        setTimeout(() => {
          onCallEnd(false)
        }, 2000)
      }

      else if (data.type === "webrtc_offer") {
        // Receiver side sets remote offer and creates answer
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            isDescriptionSetRef.current = true

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            ws.send(JSON.stringify({
              type: "webrtc_answer",
              receiver_id: session.peer._id,
              sender_email: myEmail,
              sdp: answer
            }))

            // Process queued candidates
            while (iceCandidatesQueueRef.current.length > 0) {
              const cand = iceCandidatesQueueRef.current.shift()
              await pc.addIceCandidate(new RTCIceCandidate(cand))
            }
          } catch (e) {
            console.error("Error setting WebRTC offer:", e)
          }
        }
      }

      else if (data.type === "webrtc_answer") {
        // Caller side sets remote answer
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            isDescriptionSetRef.current = true

            // Process queued candidates
            while (iceCandidatesQueueRef.current.length > 0) {
              const cand = iceCandidatesQueueRef.current.shift()
              await pc.addIceCandidate(new RTCIceCandidate(cand))
            }
          } catch (e) {
            console.error("Error setting WebRTC answer:", e)
          }
        }
      }

      else if (data.type === "ice_candidate") {
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            if (isDescriptionSetRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
            } else {
              iceCandidatesQueueRef.current.push(data.candidate)
            }
          } catch (e) {
            console.error("Error adding remote ICE candidate:", e)
          }
        }
      }

      else if (data.type === "camera_toggle") {
        setIsRemoteVideoOff(!data.enabled)
      }
    }

    ws.addEventListener("message", handleSignalingMessage)
    return () => {
      ws.removeEventListener("message", handleSignalingMessage)
    }
  }, [ws, session.peer._id, myEmail])

  // Handle call answer click
  const handleAnswerCall = async () => {
    audioControllerRef.current.stop()
    setCallState("active")

    const stream = await initLocalStream()
    if (!stream) return

    const pc = createPeerConnection(stream)

    // Send accept request
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "call_accept",
        receiver_id: session.peer._id,
        sender_email: myEmail
      }))
    }
  }

  // Handle call decline click
  const handleDeclineCall = () => {
    audioControllerRef.current.stop()
    audioControllerRef.current.playEndTone()

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "call_reject",
        receiver_id: session.peer._id,
        sender_email: myEmail
      }))
      
      // Save rejected call log to database
      ws.send(JSON.stringify({
        type: "call_end",
        receiver_id: session.peer._id,
        sender_email: myEmail,
        call_type: session.callType,
        call_status: "rejected",
        call_duration: 0,
        save_log: true,
        caller_email: session.peer.email,
        receiver_email: myEmail
      }))
    }

    onCallEnd(false)
  }

  // Handle Call Timeout (No Answer after 30s)
  const handleCallTimeout = () => {
    audioControllerRef.current.stop()
    audioControllerRef.current.playEndTone()
    setCallState("no_answer")

    cleanupMedia()

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "call_end",
        receiver_id: session.peer._id,
        sender_email: myEmail,
        call_type: session.callType,
        call_status: "missed",
        call_duration: 0,
        save_log: true,
        caller_email: myEmail,
        receiver_email: session.peer.email
      }))
    }

    setTimeout(() => {
      onCallEnd(false)
    }, 2000)
  }

  // Handle Manual Hang up (by clicking End Call red button)
  const handleHangUp = (logCall = true, forcedStatus = null) => {
    audioControllerRef.current.stop()
    audioControllerRef.current.playEndTone()
    setCallState("ended")

    cleanupMedia()

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "call_end",
        receiver_id: session.peer._id,
        sender_email: myEmail,
        call_type: session.callType,
        call_status: forcedStatus || (duration > 0 ? "completed" : "missed"),
        call_duration: duration,
        save_log: logCall,
        caller_email: session.type === "outgoing" ? myEmail : session.peer.email,
        receiver_email: session.type === "outgoing" ? session.peer.email : myEmail
      }))
    }

    setTimeout(() => {
      onCallEnd(true)
    }, 1500)
  }

  // Release camera and audio streams
  const cleanupMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    isDescriptionSetRef.current = false
    iceCandidatesQueueRef.current = []
  }

  useEffect(() => {
    return () => cleanupMedia()
  }, [])

  // Toggle Microphone mute state
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  // Toggle Camera video state
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      let nowEnabled = false
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
        nowEnabled = track.enabled
      })
      setIsVideoOff(!nowEnabled)
      
      // Notify remote peer
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "camera_toggle",
          receiver_id: session.peer._id,
          sender_email: myEmail,
          enabled: nowEnabled
        }))
      }
    }
  }

  // Format timer duration to MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="call-container-overlay video">
      <div className="glass-panel">
        
        {/* Call Info Section */}
        <div className="call-header-info">
          <div className="pulse-avatar-container">
            <img 
              src={session.peer.photo || "/default-avatar.png"} 
              alt={session.peer.name} 
              className={`peer-call-avatar ${callState === "initiating" || callState === "incoming" ? "pulsing" : ""}`}
            />
            {callState === "active" && (
              <span className="live-badge">{t?.live || "LIVE"}</span>
            )}
          </div>
          <h2 className="peer-call-name">{session.peer.name}</h2>
          <p className="peer-call-email">{session.peer.email}</p>
          
          <div className="call-status-indicator">
            {callState === "initiating" && (
              <span className="status-lbl loading-dots">{t?.calling || "Занг зада истодааст"}</span>
            )}
            {callState === "incoming" && (
              <span className="status-lbl ring">{t?.incoming_call || "Занги воридотӣ"}</span>
            )}
            {callState === "active" && (
              <div className="timer-section">
                <span className="timer-icon">●</span>
                <span className="timer-lbl">{formatDuration(duration)}</span>
              </div>
            )}
            {callState === "rejected" && (
              <span className="status-lbl error">{t?.call_rejected || "Занг рад шуд"}</span>
            )}
            {callState === "no_answer" && (
              <span className="status-lbl error">{t?.call_missed || "Занг бе ҷавоб"}</span>
            )}
            {callState === "ended" && (
              <span className="status-lbl">{t?.call_ended || "Занг анҷом ёфт"}</span>
            )}
          </div>
        </div>

        {/* Video Feeds Container */}
        {callState === "active" && (
          <div className="video-streams-wrapper">
            {/* Fullscreen Remote Video or Blurred Avatar Fallback */}
            <div className="remote-video-box">
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className={`remote-video-feed ${isRemoteVideoOff ? "hidden-feed" : ""}`}
              />
              {!remoteStream && !isRemoteVideoOff && (
                <div className="video-placeholder">
                  <div className="spinner" />
                  <p>{t?.call_connected || "Пайваст шуд, интизори видео..."}</p>
                </div>
              )}
              {isRemoteVideoOff && (
                <div className="remote-avatar-bg-fallback">
                  <div className="avatar-blur-bg" style={{ backgroundImage: `url(${session.peer.photo || "/default-avatar.png"})` }} />
                  <div className="avatar-foreground-container">
                    <p className="remote-cam-status-lbl">{t?.camera_muted || "Камера хомӯш аст"}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Picture-in-Picture Local Video */}
            <div className="local-video-box">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`local-video-feed ${isVideoOff ? "hidden-feed" : ""}`}
              />
              {isVideoOff && (
                <div className="video-placeholder camera-muted">
                  <span className="camera-muted-icon">📷</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Control Action Buttons */}
        <div className="call-actions-row">
          
          {/* Active Call Actions */}
          {callState === "active" && (
            <>
              {/* Mute button */}
              <button 
                onClick={handleToggleMute} 
                className={`action-circle-btn mute-btn ${isMuted ? "muted" : ""}`}
                title={isMuted ? t?.unmute || "Фаъол кардани овоз" : t?.mute || "Хомӯш кардани овоз"}
              >
                <span>{isMuted ? "🎙️" : "🎤"}</span>
              </button>

              {/* End Call button */}
              <button 
                onClick={() => handleHangUp(true)} 
                className="action-circle-btn end-call-btn"
                title={t?.end_call || "Анҷоми занг"}
              >
                <span>📞</span>
              </button>

              {/* Camera on/off button */}
              <button 
                onClick={handleToggleVideo} 
                className={`action-circle-btn camera-btn ${isVideoOff ? "off" : ""}`}
                title={isVideoOff ? t?.camera_on || "Камера фаъол" : t?.camera_off || "Камера хомӯш"}
              >
                <span>{isVideoOff ? "❌📷" : "📷"}</span>
              </button>
            </>
          )}

          {/* Outgoing Ringing / Initiating Call Actions */}
          {callState === "initiating" && (
            <button 
              onClick={() => handleHangUp(true, "missed")} 
              className="action-circle-btn end-call-btn"
              title={t?.end_call || "Анҷоми занг"}
            >
              <span>📞</span>
            </button>
          )}

          {/* Incoming Call Actions (Answer / Decline) */}
          {callState === "incoming" && (
            <div className="incoming-buttons">
              {/* Decline Button */}
              <button 
                onClick={handleDeclineCall} 
                className="action-circle-btn decline-btn"
                title={t?.decline || "Рад кардан"}
              >
                <span>📞</span>
              </button>
              
              {/* Answer Button */}
              <button 
                onClick={handleAnswerCall} 
                className="action-circle-btn answer-btn"
                title={t?.accept || "Ҷавоб додан"}
              >
                <span>📞</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
