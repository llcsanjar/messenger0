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
  const [isMinimized, setIsMinimized] = useState(false)

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

  const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const pipPosRef = useRef({ x: 0, y: 0 })

  // Keep reference updated
  useEffect(() => {
    pipPosRef.current = pipPosition
  }, [pipPosition])

  const handlePipDragStart = (e) => {
    if (!isMinimized) return

    isDraggingRef.current = false
    
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY

    dragStartPosRef.current = {
      x: clientX,
      y: clientY,
      initialX: pipPosRef.current.x,
      initialY: pipPosRef.current.y
    }

    const handleDragMove = (moveEvent) => {
      const currentX = moveEvent.type.startsWith('touch') ? moveEvent.touches[0].clientX : moveEvent.clientX
      const currentY = moveEvent.type.startsWith('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY

      const deltaX = currentX - dragStartPosRef.current.x
      const deltaY = currentY - dragStartPosRef.current.y

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isDraggingRef.current = true
      }

      setPipPosition({
        x: dragStartPosRef.current.initialX + deltaX,
        y: dragStartPosRef.current.initialY + deltaY
      })
    }

    const handleDragEnd = () => {
      window.removeEventListener('mousemove', handleDragMove)
      window.removeEventListener('mouseup', handleDragEnd)
      window.removeEventListener('touchmove', handleDragMove)
      window.removeEventListener('touchend', handleDragEnd)
    }

    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('touchmove', handleDragMove, { passive: true })
    window.addEventListener('touchend', handleDragEnd)
  }

  const handlePanelClick = (e) => {
    if (isMinimized) {
      e.stopPropagation()
      if (!isDraggingRef.current) {
        setIsMinimized(false)
      }
    }
  }

  useEffect(() => {
    if (session.callType === "voice" && callState === "active" && localStreamRef.current && !hasAutoCameraOffRef.current) {
      hasAutoCameraOffRef.current = true
      
      if (!isVideoOff) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = false
        })
        setIsVideoOff(true)
        
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

  // Callback refs to robustly bind stream to video element when it mounts/remounts
  const localVideoCallbackRef = (node) => {
    localVideoRef.current = node
    if (node && localStream) {
      if (node.srcObject !== localStream) {
        node.srcObject = localStream
      }
    }
  }

  const remoteVideoCallbackRef = (node) => {
    remoteVideoRef.current = node
    if (node && remoteStream) {
      if (node.srcObject !== remoteStream) {
        node.srcObject = remoteStream
      }
    }
  }

  // Bind local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream
      }
    }
  }, [localStream, callState])

  // Bind remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream
      }
    }
  }, [remoteStream, callState])

  // Setup sound controllers and trigger dialing/ringing
  useEffect(() => {
    if (callState === "initiating") {
      audioControllerRef.current.playDialTone()
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

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream)
    })

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }
    }

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

        createPeerConnection(stream)

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
        const pc = peerConnectionRef.current
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            isDescriptionSetRef.current = true

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

    createPeerConnection(stream)

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

  // Handle Call Timeout
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

  // Handle Manual Hang up
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

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // RENDER A SINGLE TREE WITH CSS-CONTROLLED MINIMIZATION TO PREVENT VIDEO UNMOUNT/RE-BIND BUG!
  return (
    <div 
      className={`call-container-overlay video ${callState === "active" ? "active-call" : ""} ${isMinimized ? "minimized" : ""}`}
      title={isMinimized ? "Пахш кунед ва кашед барои ҳаракат, ё клик кунед барои экрани пурра" : undefined}
    >
      <div 
        className="glass-panel" 
        onClick={handlePanelClick}
        onMouseDown={isMinimized ? handlePipDragStart : undefined}
        onTouchStart={isMinimized ? handlePipDragStart : undefined}
        style={isMinimized ? { transform: `translate(${pipPosition.x}px, ${pipPosition.y}px)` } : undefined}
      >
        
        {/* =========================================
           1. MINIMIZED LAYOUT CONTENT (Only visible inside PIP)
           ========================================= */}
        {isMinimized && (
          <div className="minimized-pip-content">
            <div className="minimized-avatar-section">
              <img src={session.peer.photo || "/default-avatar.png"} alt="" />
              <div className="minimized-status-dot green-pulse" />
            </div>
            <div className="minimized-info">
              <h4>{session.peer.name}</h4>
              {callState === "active" ? (
                <span className="minimized-timer">{formatDuration(duration)}</span>
              ) : (
                <span className="minimized-status">{t?.calling || "Занг..."}</span>
              )}
            </div>
            <div className="minimized-actions" onClick={(e) => e.stopPropagation()}>
              <button 
                className={`minimized-action-btn mute ${isMuted ? "muted" : ""}`}
                onClick={handleToggleMute}
                title={isMuted ? t?.unmute : t?.mute}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zm-8.31-7.8l-.7.71 4.54 4.54V11c0 1.66 1.34 3 3 3 .58 0 1.11-.17 1.55-.45l3.28 3.28c-.9.59-1.98.98-3.15 1.07v2.1h-2v-2.1c-3.14-.24-5.65-2.61-5.91-5.65H4v-1.7c0-1.19.34-2.3.9-3.28l-2.23-2.23 1.01-1.02z"></path></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.4 2.72 6.2 6 6.6V21h2v-3.4c3.28-.4 6-3.2 6-6.6h-1.7z"></path></svg>
                )}
              </button>
              <button 
                className="minimized-action-btn end"
                onClick={() => handleHangUp(true)}
                title={t?.end_call}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>
              </button>
            </div>
          </div>
        )}

        {/* =========================================
           2. FULL SCREEN CONTENT (Always rendered, hidden in PIP by CSS class)
           ========================================= */}
        <div className="fullscreen-ui-content">
          {/* Minimize Button at Top-Right */}
          {callState === "active" && (
            <button 
              className="minimize-call-btn" 
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              title="Хурд кардани оинаи занг"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6m0-6l-7 7m17-7h-6V8m0 6l7-7"></path></svg>
            </button>
          )}

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

          {/* Video Feeds Container - Split Screen 50% / 50% */}
          {callState === "active" && (
            <div className="video-streams-wrapper">
              {/* Split Remote Video (Left column or Top row) */}
              <div className="remote-video-box">
                <video 
                  ref={remoteVideoCallbackRef} 
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
                      <img src={session.peer.photo || "/default-avatar.png"} alt="" className="remote-avatar-fg" />
                      <p className="remote-cam-status-lbl">{t?.camera_muted || "Камера хомӯш аст"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Split Local Video (Right column or Bottom row) */}
              <div className="local-video-box">
                <video 
                  ref={localVideoCallbackRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`local-video-feed ${isVideoOff ? "hidden-feed" : ""}`}
                />
                {isVideoOff && (
                  <div className="video-placeholder camera-muted">
                    <div className="avatar-blur-bg" style={{ backgroundImage: `url(${session.peer.photo || "/default-avatar.png"})` }} />
                    <div className="camera-muted-foreground-container">
                      <span className="camera-muted-icon">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM2.27 2.27L1 3.54l3 3V17c0 1.1.9 2 2 2h10c.34 0 .65-.09.93-.24l2.8 2.8 1.27-1.27L2.27 2.27zM6 17V8.54l8.46 8.46H6z"></path></svg>
                      </span>
                      <p className="local-cam-status-lbl">{t?.camera_off || "Камера хомӯш"}</p>
                    </div>
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
                {/* Toggle Mic Button */}
                <button 
                  onClick={handleToggleMute} 
                  className={`action-circle-btn mute-btn ${isMuted ? "muted" : ""}`}
                  title={isMuted ? t?.unmute || "Фаъол кардани овоз" : t?.mute || "Хомӯш кардани овоз"}
                >
                  {isMuted ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zm-8.31-7.8l-.7.71 4.54 4.54V11c0 1.66 1.34 3 3 3 .58 0 1.11-.17 1.55-.45l3.28 3.28c-.9.59-1.98.98-3.15 1.07v2.1h-2v-2.1c-3.14-.24-5.65-2.61-5.91-5.65H4v-1.7c0-1.19.34-2.3.9-3.28l-2.23-2.23 1.01-1.02z"></path></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.4 2.72 6.2 6 6.6V21h2v-3.4c3.28-.4 6-3.2 6-6.6h-1.7z"></path></svg>
                  )}
                </button>

                {/* End Call Button */}
                <button 
                  onClick={() => handleHangUp(true)} 
                  className="action-circle-btn end-call-btn"
                  title={t?.end_call || "Анҷоми занг"}
                >
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>
                </button>

                {/* Toggle Camera Button */}
                <button 
                  onClick={handleToggleVideo} 
                  className={`action-circle-btn camera-btn ${isVideoOff ? "off" : ""}`}
                  title={isVideoOff ? t?.camera_on || "Камера фаъол" : t?.camera_off || "Камера хомӯш"}
                >
                  {isVideoOff ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM2.27 2.27L1 3.54l3 3V17c0 1.1.9 2 2 2h10c.34 0 .65-.09.93-.24l2.8 2.8 1.27-1.27L2.27 2.27zM6 17V8.54l8.46 8.46H6z"></path></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"></path></svg>
                  )}
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
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>
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
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>
                </button>
                
                {/* Answer Button */}
                <button 
                  onClick={handleAnswerCall} 
                  className="action-circle-btn answer-btn"
                  title={t?.accept || "Ҷавоб додан"}
                >
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
