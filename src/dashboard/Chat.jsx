import {
  useEffect,
  useRef,
  useState,
  useCallback
} from "react"

import { auth } from "../registration/firebase"
import { encryptMessage, decryptMessage, encryptAudioBlob, decryptAudioBlob } from "../registration/crypto"
import { API_URL } from "../config"

import "./Chat.css"
import { getTranslation } from "../translations"

// Компонент барои рендери матн бо линкҳои кликшаванда
const MessageTextWithLinks = ({ text, t, isEdited }) => {
  if (!text || text === "deleted_message") {
    return <span>{text === "deleted_message" ? t?.deleted_message || "Паём ҳазф шудааст" : text}</span>
  }

  // Рекс барои шинохтани линкҳои http:// ва https://
  const urlRegex = /(https?:\/\/[^\s]+)/g
  
  const parts = text.split(urlRegex)
  
  return (
    <span>
      {parts.map((part, index) => {
        if (part && part.match(urlRegex)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="message-link"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          )
        }
        return <span key={index}>{part}</span>
      })}
      {isEdited && <span className="edited-badge">{t.edited || "таҳрир шуд"}</span>}
    </span>
  )
}

// Эмодзиҳо барои реаксия - 100+ эмодзи
const EMOJI_REACTIONS = [
  "👍", "❤️", "😂", "😮", "😢", "🙏", "👎", "😡", "🥰", "😍",
  "🤣", "😅", "😆", "😉", "😊", "😋", "😎", "🤩", "🥳", "😏",
  "😒", "😞", "😔", "😟", "😤", "😭", "😱", "😴", "🤔", "🤗",
  "🤫", "🤐", "😶", "😑", "😬", "🙄", "😯", "😦", "😧", "😨",
  "😰", "😥", "😓", "🤯", "🤬", "😈", "👿", "💀", "☠️", "💩",
  "👻", "👽", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽",
  "🙀", "😿", "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌",
  "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇",
  "☝️", "👏", "🙌", "🤝", "💪", "🦾", "🦿", "🦵", "🦶", "👂",
  "🦻", "👃", "🧠", "🫀", "🫁", "💯", "🔥", "⭐", "🌟", "✨",
  "💫", "🎉", "🎊", "🎈", "💝", "💖", "💗", "💓", "💞", "💕",
]

// Форматкунии вақт ба стили Telegram (HH:MM)
const formatTime = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Форматкунии сана ба стили Telegram бо тарҷума
const formatDateLabel = (dateString, t) => {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  const dateStr = date.toLocaleDateString()
  const todayStr = today.toLocaleDateString()
  const yesterdayStr = yesterday.toLocaleDateString()
  
  if (dateStr === todayStr) {
    return t.today
  } else if (dateStr === yesterdayStr) {
    return t.yesterday
  } else {
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`
  }
}

// Функсияи тафтиши рӯзи нав
const isNewDay = (prevDate, currDate) => {
  if (!prevDate) return true
  const prev = new Date(prevDate).toLocaleDateString()
  const curr = new Date(currDate).toLocaleDateString()
  return prev !== curr
}

// Функсия барои форматкунии вақти охирин онлайн бо тарҷума
const formatLastOnline = (lastOnlineDate, t) => {
  if (!lastOnlineDate) return "..."
  
  const last = new Date(lastOnlineDate)
  const now = new Date()
  const diffMs = now - last
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return t.just_now
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? t.minute_ago : t.minutes_ago}`
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? t.hour_ago : t.hours_ago}`
  if (diffDays === 1) return t.yesterday
  return `${diffDays} ${diffDays === 1 ? t.day_ago : t.days_ago}`
}

// Audio Player Component - Telegram Style
const AudioPlayer = ({ msg, myId, t }) => {
  const [audioUrl, setAudioUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef(null)

  const duration = msg.duration || 0

  const formatAudioTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds === Infinity || seconds <= 0) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const loadAudio = async () => {
    if (audioUrl) return audioUrl
    setLoading(true)
    setError(null)
    try {
      const isMe = msg.sender_id === myId
      const encKey = isMe ? msg.sender_encrypted_key : msg.receiver_encrypted_key
      let blob
      if (msg.iv && encKey) {
        blob = await decryptAudioBlob(msg.text, msg.iv, encKey)
      } else {
        const binaryStr = atob(msg.text)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        blob = new Blob([bytes], { type: 'audio/webm' })
      }
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      return url
    } catch (err) {
      setError('Хатогии кушодани садо')
      return null
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = async () => {
    if (error) return
    let url = audioUrl
    if (!url) {
      url = await loadAudio()
      if (!url) return
    }
    if (audioRef.current) {
      if (audioRef.current.src !== url) {
        audioRef.current.src = url
      }
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current && !isNaN(audioRef.current.currentTime)) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  const renderWaveform = () => {
    const bars = []
    const barCount = 20
    for (let i = 0; i < barCount; i++) {
      bars.push(
        <div
          key={i}
          className={`wave-bar ${isPlaying ? 'playing' : ''}`}
          style={{
            height: isPlaying ? `${Math.min(24, Math.max(6, 6 + Math.sin(Date.now() * 0.005 + i) * 6))}px` : '6px',
            animationDelay: `${i * 0.03}s`
          }}
        />
      )
    }
    return bars
  }

  let displayTime = "0:00"
  if (isPlaying && currentTime > 0 && !isNaN(currentTime)) {
    displayTime = formatAudioTime(currentTime)
  } else if (duration > 0) {
    displayTime = formatAudioTime(duration)
  } else {
    displayTime = "0:00"
  }

  return (
    <div className="audio-message">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="none"
      />
      <div className="audio-player">
        {!isPlaying ? (
          <button
            className="play-button"
            onClick={handlePlay}
            disabled={loading}
          >
            {loading ? (
              <div className="audio-loading" />
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{marginLeft: '2px'}}><path d="M8 5v14l11-7z"></path></svg>
            )}
          </button>
        ) : (
          <button className="play-button" onClick={handlePause}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
          </button>
        )}
        <div className="waveform-container">
          {renderWaveform()}
        </div>
        <span className="audio-duration">{displayTime}</span>
      </div>
      {error && (
        <div className="audio-error">
          <span>⚠️</span> {error}
        </div>
      )}
    </div>
  )
}

function Chat({ selectedUser, onlineUsers, ws, language, handleMobileBack, startCall }) {

  const messagesRef = useRef(null)
  const selectedUserRef = useRef(selectedUser)

  const [messagesByChat, setMessagesByChat] = useState({})
  const [allMessages, setAllMessages] = useState([])
  const [myId, setMyId] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [reactionMenu, setReactionMenu] = useState(null)
  const [deleteMenu, setDeleteMenu] = useState(null)
  const [editMenu, setEditMenu] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editText, setEditText] = useState("")
  
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [oldestMessageDate, setOldestMessageDate] = useState(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  
  const [userStatus, setUserStatus] = useState({
    is_online: false,
    last_online: null
  })

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)

  const reactionMenuRef = useRef(null)
  const reactionScrollRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressActive = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const prevScrollTopRef = useRef(0)
  const isFirstLoadRef = useRef(true)
  const isLoadingMessagesRef = useRef(false)

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const user = auth.currentUser
  
  const t = getTranslation(language)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    selectedUserRef.current = selectedUser
  }, [selectedUser])

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getCurrentMessage = () => {
    const chatId = selectedUser?._id
    return chatId ? messagesByChat[chatId] || "" : ""
  }

  const setCurrentMessage = (newMessage) => {
    const chatId = selectedUser?._id
    if (chatId) {
      setMessagesByChat(prev => ({
        ...prev,
        [chatId]: newMessage
      }))
    }
  }

  useEffect(() => {
    if (selectedUser && onlineUsers[selectedUser.email]) {
      setUserStatus({
        is_online: onlineUsers[selectedUser.email].is_online || false,
        last_online: onlineUsers[selectedUser.email].last_online || null
      })
    } else if (selectedUser) {
      setUserStatus({
        is_online: false,
        last_online: null
      })
    }
  }, [selectedUser, onlineUsers])

  useEffect(() => {
    setReplyTo(null)
    closeAllMenus()
    setEditingMessage(null)
    setEditMenu(null)
    
    setAllMessages([])
    setHasMore(true)
    setOldestMessageDate(null)
    setInitialLoadDone(false)
    isFirstLoadRef.current = true
    isLoadingMessagesRef.current = false
    
    if (isRecording) {
      cleanupRecording()
    }
  }, [selectedUser])

  useEffect(() => {
    return () => {
      closeAllMenus()
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
          }
          if (mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
          }
        } catch (e) {}
        mediaRecorderRef.current = null
      }
    }
  }, [])

  const decryptMessages = async (messageList, currentUserId) => {
    return await Promise.all(
      messageList.map(async (msg) => {
        if (msg.is_deleted_for_me) return null

        if (msg.message_type === 'call') {
          return {
            ...msg,
            decryptedText: msg.text,
            is_read: msg.is_read,
            is_edited: false,
            reactions: {}
          }
        }

        let decryptedText = msg.text
        let decryptedReply = null
        
        if (msg.is_deleted_for_everyone) {
          decryptedText = "deleted_message"
        } else if (msg.iv) {
          const isMe = msg.sender_id === currentUserId;
          const encKey = isMe ? msg.sender_encrypted_key : msg.receiver_encrypted_key;
          if (encKey) {
            try {
              decryptedText = await decryptMessage(msg.text, msg.iv, encKey);
            } catch (e) {
              decryptedText = msg.text
            }
          } else {
            decryptedText = msg.text
          }
        }

        if (msg.reply_to) {
          if (msg.reply_to.is_deleted_for_everyone) {
            decryptedReply = {
              ...msg.reply_to,
              decryptedText: "deleted_message"
            }
          } else if (msg.reply_to.iv) {
            const replyIsMe = msg.reply_to.sender_id === currentUserId
            const replyEncKey = replyIsMe
              ? msg.reply_to.sender_encrypted_key
              : msg.reply_to.receiver_encrypted_key
              
            let replyText = msg.reply_to.text
            if (replyEncKey) {
              try {
                replyText = await decryptMessage(
                  msg.reply_to.text,
                  msg.reply_to.iv,
                  replyEncKey
                )
              } catch (e) {
                replyText = msg.reply_to.text
              }
            }
            
            decryptedReply = {
              ...msg.reply_to,
              decryptedText: msg.reply_to.message_type === 'audio' ? "audio_message" : replyText
            }
          } else {
            decryptedReply = {
              ...msg.reply_to,
              decryptedText: msg.reply_to.message_type === 'audio' ? "audio_message" : msg.reply_to.text
            }
          }
        }

        return {
          ...msg,
          decryptedText,
          is_read: msg.is_read,
          is_edited: msg.is_edited || false,
          edited_at: msg.edited_at,
          decryptedReply,
          reactions: msg.reactions || {}
        }
      })
    ).then(results => results.filter(msg => msg !== null))
  };

  const loadMessages = async (beforeDate = null, isInitial = false) => {
    if (!selectedUser || !myId) {
      return
    }
    if (isLoadingMore) return
    if (!isInitial && !hasMore) return
    if (isLoadingMessagesRef.current) return

    isLoadingMessagesRef.current = true
    setIsLoadingMore(true)

    try {
      let url = `${API_URL}/messages/${user.email}/${selectedUser._id}?limit=10`
      if (beforeDate) {
        url += `&before=${encodeURIComponent(beforeDate)}`
      }

      const response = await fetch(url)
      const data = await response.json()
      
      if (selectedUserRef.current?._id !== selectedUser._id) {
        return
      }
      
      const decrypted = await decryptMessages(data, myId)
      
      const sortedMessages = [...decrypted].sort((a, b) => 
        new Date(a.sent_at) - new Date(b.sent_at)
      )

      if (isInitial) {
        setAllMessages(sortedMessages)
        setInitialLoadDone(true)
        isFirstLoadRef.current = false
        setTimeout(() => {
          if (messagesRef.current && selectedUserRef.current?._id === selectedUser._id) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight
          }
        }, 100)
      } else {
        if (sortedMessages.length > 0) {
          setAllMessages(prev => [...sortedMessages, ...prev])
          
          setTimeout(() => {
            if (messagesRef.current && prevScrollHeightRef.current > 0 && 
                selectedUserRef.current?._id === selectedUser._id) {
              const newScrollHeight = messagesRef.current.scrollHeight
              const heightDiff = newScrollHeight - prevScrollHeightRef.current
              messagesRef.current.scrollTop = prevScrollTopRef.current + heightDiff
            }
          }, 50)
        }
      }

      if (sortedMessages.length < 10) {
        setHasMore(false)
      } else if (sortedMessages.length > 0) {
        const oldestMsg = sortedMessages[0]
        setOldestMessageDate(oldestMsg.sent_at)
      }

      if (isInitial && selectedUserRef.current?._id === selectedUser._id) {
        sendReadReceipt()
      }
      
    } catch (error) {
      console.error("Error loading messages:", error)
    } finally {
      setIsLoadingMore(false)
      isLoadingMessagesRef.current = false
    }
  }

  const handleScroll = useCallback(() => {
    if (!messagesRef.current) return
    if (isLoadingMore || !hasMore) return

    const { scrollTop } = messagesRef.current
    
    if (scrollTop < 50 && initialLoadDone && allMessages.length > 0) {
      prevScrollTopRef.current = scrollTop
      prevScrollHeightRef.current = messagesRef.current.scrollHeight
      
      loadMessages(oldestMessageDate, false)
    }
  }, [isLoadingMore, hasMore, initialLoadDone, allMessages.length, oldestMessageDate])

  useEffect(() => {
    const messagesContainer = messagesRef.current
    if (messagesContainer && initialLoadDone) {
      messagesContainer.addEventListener('scroll', handleScroll)
      return () => {
        messagesContainer.removeEventListener('scroll', handleScroll)
      }
    }
  }, [handleScroll, initialLoadDone])

  const sendReadReceipt = () => {
    if (
      ws &&
      ws.readyState === WebSocket.OPEN &&
      selectedUser &&
      myId
    ) {
      ws.send(
        JSON.stringify({
          type: "read",
          sender_email: user.email,
          receiver_id: selectedUser._id
        })
      )
    }
  }

  const sendReaction = (messageId, emoji) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "reaction",
          message_id: messageId,
          emoji: emoji,
          sender_email: user.email,
          receiver_id: selectedUser._id
        })
      );
    }
  };

  const deleteMessage = (messageId, deleteType) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "delete",
          message_id: messageId,
          delete_type: deleteType,
          sender_email: user.email,
          receiver_id: selectedUser._id
        })
      );
    }
    closeDeleteMenu();
    closeAllMenus();
  };

  const editMessage = async (messageId, newText) => {
    if (!newText.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    let payload = {
      type: "edit",
      message_id: messageId,
      text: newText,
      sender_email: user.email,
      receiver_id: selectedUser._id
    };

    if (selectedUser.public_key) {
      try {
        const encrypted = await encryptMessage(newText, selectedUser.public_key);
        payload.text = encrypted.text;
        payload.iv = encrypted.iv;
        payload.sender_encrypted_key = encrypted.sender_encrypted_key;
        payload.receiver_encrypted_key = encrypted.receiver_encrypted_key;
      } catch (err) {
        console.error("Failed to encrypt edited message:", err);
        showToast(t.encryption_error || "Хатогии рамзгузорӣ", "error");
        return;
      }
    }

    ws.send(JSON.stringify(payload));
    showToast(t.message_edited || "Паём таҳрир шуд", "success");
  };

  const getMyId = async () => {
    try {
      const response = await fetch(`${API_URL}/search-users?q=${user.email}`)
      const data = await response.json()
      if (data.length > 0) {
        setMyId(data[0]._id)
      }
    } catch (error) {
      console.error("Error getting user id:", error)
    }
  }

  useEffect(() => {
    getMyId()
  }, [])

  useEffect(() => {
    if (selectedUser && myId && !initialLoadDone) {
      loadMessages(null, true)
    }
  }, [selectedUser, myId])

  // ============ WEBSOCKET MESSAGE HANDLER (аз Dashboard гирифта мешавад) ============
  useEffect(() => {
    if (!ws || !myId || !selectedUser) return

    const handleMessage = async (event) => {
      const data = JSON.parse(event.data)

      // Handle user status
      if (data.type === "user_status") {
        if (data.user_email === selectedUser.email) {
          setUserStatus({
            is_online: data.is_online,
            last_online: data.last_online
          })
        }
        return
      }

      // Handle read receipts
      if (data.type === "read") {
        if (data.reader_id === selectedUser._id && data.sender_id === myId) {
          setAllMessages((prev) =>
            prev.map((msg) =>
              msg.sender_id === myId ? { ...msg, is_read: true } : msg
            )
          )
        }
        return
      }

      // Handle reactions
      if (data.type === "reaction") {
        setAllMessages((prev) =>
          prev.map((msg) => {
            if (msg._id === data.message_id && !msg.is_deleted_for_everyone) {
              return { ...msg, reactions: data.reactions || {} };
            }
            return msg;
          })
        );
        return;
      }

      // Handle delete
      if (data.type === "delete") {
        setAllMessages((prev) =>
          prev.map((msg) => {
            if (msg._id === data.message_id) {
              if (data.delete_type === "for_everyone") {
                return {
                  ...msg,
                  text: "deleted_message",
                  is_deleted_for_everyone: true,
                  message_type: "deleted",
                  decryptedText: "deleted_message",
                  reactions: {},
                  iv: null
                };
              } else if (data.delete_type === "for_me" && data.deleted_by_email === user.email) {
                return null;
              }
            }
            return msg;
          }).filter(msg => msg !== null)
        );
        return;
      }

      // Handle edit message
      if (data.type === "edit") {
        let decryptedText = data.text;
        
        if (data.iv && !data.is_deleted_for_everyone) {
          const isMe = data.sender_email === user.email;
          const encKey = isMe ? data.sender_encrypted_key : data.receiver_encrypted_key;
          if (encKey) {
            try {
              decryptedText = await decryptMessage(data.text, data.iv, encKey);
            } catch (e) {
              decryptedText = data.text;
            }
          }
        }
        
        setAllMessages((prev) =>
          prev.map((msg) => {
            if (msg._id === data.message_id) {
              return {
                ...msg,
                text: data.text,
                decryptedText: decryptedText,
                iv: data.iv,
                sender_encrypted_key: data.sender_encrypted_key,
                receiver_encrypted_key: data.receiver_encrypted_key,
                is_edited: true,
                edited_at: data.edited_at
              };
            }
            return msg;
          })
        );
        return;
      }

      // Handle new message
      const isCurrentChat = (
        (data.sender_id === myId && data.receiver_id === selectedUser._id) ||
        (data.sender_id === selectedUser._id && data.receiver_id === myId)
      )

      if (isCurrentChat) {
        const container = messagesRef.current
        let isAtBottom = false

        if (container) {
          isAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 100
        }

        let decryptedText = data.text;
        let decryptedReply = null;

        if (data.is_deleted_for_everyone) {
          decryptedText = "deleted_message";
        } else if (data.iv && !data.is_deleted_for_everyone) {
          const isMe = data.sender_id === myId;
          const encKey = isMe ? data.sender_encrypted_key : data.receiver_encrypted_key;
          if (encKey) {
            try {
              decryptedText = await decryptMessage(data.text, data.iv, encKey);
            } catch (e) {
              decryptedText = data.text;
            }
          } else {
            decryptedText = data.text;
          }

          if (data.reply_to && data.reply_to.iv && !data.reply_to.is_deleted_for_everyone) {
            let decryptedReplyText = null

            if (data.reply_to.message_type !== 'audio') {
              const replyIsMe = data.reply_to.sender_id === myId

              const replyEncKey = replyIsMe
                ? data.reply_to.sender_encrypted_key
                : data.reply_to.receiver_encrypted_key

              if (replyEncKey) {
                try {
                  decryptedReplyText = await decryptMessage(
                    data.reply_to.text,
                    data.reply_to.iv,
                    replyEncKey
                  )
                } catch (e) {
                  decryptedReplyText = data.reply_to.text
                }
              } else {
                decryptedReplyText = data.reply_to.text
              }
            }

            decryptedReply = {
              ...data.reply_to,
              decryptedText:
                data.reply_to.message_type === 'audio'
                  ? "audio_message"
                  : decryptedReplyText
            }
          } else if (data.reply_to) {
            decryptedReply = {
              ...data.reply_to,
              decryptedText: data.reply_to.is_deleted_for_everyone ? "deleted_message" : data.reply_to.text
            }
          }
        } else if (data.is_deleted_for_everyone) {
          decryptedText = "deleted_message"
        }

        const decryptedData = {
          ...data,
          decryptedText,
          is_read: data.is_read,
          is_edited: false,
          decryptedReply,
          reactions: data.reactions || {}
        };

        setAllMessages((prev) => [...prev, decryptedData])

        if (data.sender_id === selectedUser._id) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "read",
              sender_email: user.email,
              receiver_id: selectedUser._id
            }))
          }
        }

        setTimeout(() => {
          if (isAtBottom && container) {
            container.scrollTop = container.scrollHeight
          }
        }, 50)
      }
    }

    ws.addEventListener('message', handleMessage)

    return () => {
      ws.removeEventListener('message', handleMessage)
    }
  }, [ws, myId, selectedUser, user?.email])

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressActive.current = false;
  };

  const showCursorEffect = (x, y) => {
    const ripple = document.createElement('div');
    ripple.className = 'cursor-ripple';
    ripple.style.left = (x - 20) + 'px';
    ripple.style.top = (y - 20) + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 300);
  };

  const calculateMenuPosition = useCallback((clientX, clientY, element, isOwnMessage = true, isAudio = false) => {
    const menuHeight = (isAudio || !isOwnMessage) ? 200 : 300;
    
    const menuWidth = 320;
    const padding = 10;
    const offsetFromCursor = 20;

    let x, y;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (element) {
      const rect = element.getBoundingClientRect();
      y = rect.top - menuHeight - 8;
      if (y < padding) {
        y = rect.bottom + 8;
      }
      x = rect.left + (rect.width / 2) - (menuWidth / 2);
    } 
    else {
      x = clientX - menuWidth / 2;
      y = clientY - menuHeight - offsetFromCursor;
      
      if (y < padding) {
        y = clientY + offsetFromCursor;
      }
    }

    if (x < padding) {
      x = padding;
    }
    if (x + menuWidth > viewportWidth - padding) {
      x = viewportWidth - menuWidth - padding;
    }
    if (y < padding) {
      y = padding;
    }
    if (y + menuHeight > viewportHeight - padding) {
      y = viewportHeight - menuHeight - padding;
    }
    if (y < 0) {
      y = padding;
    }

    return { x, y };
  }, []);

  const openReactionMenu = (e, msg) => {
    if (msg.is_deleted_for_everyone) return;
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;

    e.preventDefault();
    e.stopPropagation();

    let clientX, clientY;
    let targetElement = null;

    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      targetElement = e.currentTarget;
    } 
    else if (e.type === 'contextmenu') {
      clientX = e.clientX;
      clientY = e.clientY;
      targetElement = null;
    } 
    else {
      clientX = e.clientX;
      clientY = e.clientY;
      targetElement = e.currentTarget;
    }

    showCursorEffect(clientX, clientY);
    
    const isOwnMessage = msg.sender_id === myId;
    const isAudio = msg.message_type === 'audio';
    
    const position = calculateMenuPosition(clientX, clientY, targetElement, isOwnMessage, isAudio);

    setReactionMenu({
      x: position.x,
      y: position.y,
      message: msg
    });

    if (targetElement) {
      targetElement.style.transform = 'scale(0.98)';
      setTimeout(() => {
        if (targetElement) targetElement.style.transform = '';
      }, 100);
    }
  };

  const openDeleteMenuForMessage = (msg) => {
    if (msg.is_deleted_for_everyone) return;

    setDeleteMenu({
      x: reactionMenu?.x || window.innerWidth / 2 - 160,
      y: reactionMenu?.y || window.innerHeight / 2,
      message: msg
    });
    setReactionMenu(null);
  };

  const openEditMenu = (msg) => {
    if (msg.sender_id !== myId || msg.is_deleted_for_everyone) return;
    
    const sentAt = new Date(msg.sent_at);
    const now = new Date();
    const diffMinutes = (now - sentAt) / 60000;
    
    if (diffMinutes > 5) {
      showToast(t.edit_time_expired || "Вақти таҳрири паём гузашт (5 дақиқа)", "error");
      return;
    }
    
    setEditMenu({
      x: reactionMenu?.x || window.innerWidth / 2 - 200,
      y: reactionMenu?.y || window.innerHeight / 2,
      message: msg
    });
    setEditText(msg.decryptedText || msg.text);
    setReactionMenu(null);
    setDeleteMenu(null);
  };

  const handleDoubleClick = (e, msg) => {
    if (msg.is_deleted_for_everyone) return;
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    e.preventDefault();
    e.stopPropagation();
    clearLongPress();
    sendReaction(msg._id, "❤️");
  };

  const handleTouchStart = (e, msg) => {
    if (msg.is_deleted_for_everyone) return;
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    e.preventDefault();
    e.stopPropagation();
    clearLongPress();
    longPressActive.current = true;
    longPressTimer.current = setTimeout(() => {
      if (longPressActive.current) {
        openReactionMenu(e, msg);
      }
      clearLongPress();
    }, 250);
  };

  const handleTouchEnd = (e, msg) => {
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    clearLongPress();
  };

  const handleTouchMove = (e, msg) => {
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    clearLongPress();
  };

  const handleMouseDown = (e, msg) => {
    if (msg.is_deleted_for_everyone) return;
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      clearLongPress();
      longPressActive.current = true;
      longPressTimer.current = setTimeout(() => {
        if (longPressActive.current) {
          openReactionMenu(e, msg);
        }
        clearLongPress();
      }, 250);
    }
  };

  const handleMouseUp = (e, msg) => {
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    clearLongPress();
  };

  const handleMouseLeave = (e, msg) => {
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    clearLongPress();
  };

  const handleContextMenu = (e, msg) => {
    if (msg.is_deleted_for_everyone) return;
    if (editMenu && editMenu.message && editMenu.message._id === msg._id) return;
    e.preventDefault();
    e.stopPropagation();
    clearLongPress();
    openReactionMenu(e, msg);
  };

  const closeAllMenus = () => {
    setReactionMenu(null);
    setDeleteMenu(null);
    setEditMenu(null);
    setEditingMessage(null);
    clearLongPress();
  };

  const closeDeleteMenu = () => {
    setDeleteMenu(null);
    clearLongPress();
  };

  const closeEditMenu = () => {
    setEditMenu(null);
    setEditText("");
    clearLongPress();
  };

  const handleReplyFromMenu = () => {
    if (reactionMenu && reactionMenu.message && !reactionMenu.message.is_deleted_for_everyone) {
      setReplyTo(reactionMenu.message);
      closeAllMenus();
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 2000);
  };

  const handleCopyText = () => {
    if (reactionMenu && reactionMenu.message && !reactionMenu.message.is_deleted_for_everyone) {
      let textToCopy = "";
      
      if (reactionMenu.message.message_type === 'audio') {
        textToCopy = t.audio_message;
      } 
      else {
        textToCopy = translateMessageText(
          reactionMenu.message.decryptedText || reactionMenu.message.text, 
          reactionMenu.message.message_type
        );
      }
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast(t.copied_text || "Матн нусха бардошта шуд");
      }).catch(err => {
        console.error("Хатогии нусхабардорӣ:", err);
        showToast(t.copy_error || "Хатогии нусхабардорӣ", "error");
      });
      
      closeAllMenus();
    }
  };

  const handleReactionClick = (emoji) => {
    if (reactionMenu && reactionMenu.message && !reactionMenu.message.is_deleted_for_everyone) {
      sendReaction(reactionMenu.message._id, emoji);
      closeAllMenus();
    }
  };

  const handleDeleteForMe = () => {
    if (deleteMenu && deleteMenu.message) {
      deleteMessage(deleteMenu.message._id, "for_me");
    }
  };

  const handleDeleteForEveryone = () => {
    if (deleteMenu && deleteMenu.message) {
      deleteMessage(deleteMenu.message._id, "for_everyone");
    }
  };

  const handleEditSubmit = async () => {
    if (editMenu && editMenu.message && editText.trim() && editText !== (editMenu.message.decryptedText || editMenu.message.text)) {
      await editMessage(editMenu.message._id, editText);
      closeEditMenu();
    } else {
      closeEditMenu();
    }
  };

  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    }
    if (e.key === 'Escape') {
      closeEditMenu();
    }
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!reactionMenu && !deleteMenu && !editMenu) return;
      const target = e.target;
      const isClickInsideReactionMenu = target.closest('.reaction-menu');
      const isClickInsideDeleteMenu = target.closest('.delete-modal-content');
      const isClickInsideEditMenu = target.closest('.edit-menu');
      const isClickInsideMessage = target.closest('.my-message') || target.closest('.other-message');
      const isClickOnReactionBadge = target.closest('.reaction-badge');

      if (isClickInsideReactionMenu || isClickInsideDeleteMenu || isClickInsideEditMenu || isClickInsideMessage || isClickOnReactionBadge) {
        return;
      }
      closeAllMenus();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [reactionMenu, deleteMenu, editMenu]);

  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      setRecordingTime(0)
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [isRecording])

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const cleanupRecording = useCallback(() => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      if (mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current

        if (recorder.state !== "inactive") {
          recorder.ondataavailable = null
          recorder.onstop = null

          try {
            recorder.stop()
          } catch (e) {}
        }

        if (recorder.stream) {
          recorder.stream.getTracks().forEach(track => {
            try {
              track.stop()
            } catch (e) {}
          })
        }

        mediaRecorderRef.current = null
      }

      audioChunksRef.current = []
      setIsRecording(false)
      setRecordingTime(0)
    } catch (err) {
      console.error("Recording cleanup error:", err)
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupRecording()
    }
  }, [selectedUser, cleanupRecording])

  const startRecording = async () => {
    try {
      cleanupRecording()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mediaRecorder = new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      setRecordingTime(0)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.start(100)

      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      alert('Иҷозати истифодаи микрофон лозим аст.')
    }
  }

  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return

    const recorder = mediaRecorderRef.current
    const audioDuration = recordingTime

    setIsRecording(false)

    const audioBlob = await new Promise((resolve, reject) => {
      recorder.onstop = () => {
        try {
          const blob = new Blob(audioChunksRef.current, {
            type: 'audio/webm'
          })
          resolve(blob)
        } catch (err) {
          reject(err)
        }
      }

      try {
        recorder.stop()
      } catch (err) {
        reject(err)
      }

      if (recorder.stream) {
        recorder.stream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (e) {}
        })
      }
    })

    mediaRecorderRef.current = null

    let payload = {
      sender_email: user.email,
      receiver_id: selectedUser._id,
      text: '',
      message_type: 'audio',
      duration: audioDuration
    }

    if (replyTo) payload.reply_to = replyTo._id

    if (selectedUser.public_key) {
      try {
        const encrypted = await encryptAudioBlob(
          audioBlob,
          selectedUser.public_key
        )

        payload.text = encrypted.encryptedData
        payload.iv = encrypted.iv
        payload.sender_encrypted_key = encrypted.sender_encrypted_key
        payload.receiver_encrypted_key = encrypted.receiver_encrypted_key
      } catch (err) {
        console.error('Audio encryption error:', err)
        cleanupRecording()
        return
      }
    } else {
      const reader = new FileReader()

      payload.text = await new Promise((res) => {
        reader.onloadend = () => res(reader.result.split(',')[1])
        reader.readAsDataURL(audioBlob)
      })
    }

    if (
      ws &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(JSON.stringify(payload))
    }

    audioChunksRef.current = []
    setReplyTo(null)

    setTimeout(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop =
          messagesRef.current.scrollHeight
      }
    }, 50)
  }

  const cancelRecording = () => {
    cleanupRecording()
  }

  const sendMessage = async () => {
    const currentMessage = getCurrentMessage()
    if (!currentMessage.trim()) return

    const container = messagesRef.current
    let isAtBottom = false

    if (container) {
      isAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 100
    }

    let payload = {
      sender_email: user.email,
      receiver_id: selectedUser._id,
      text: currentMessage,
      message_type: 'text'
    }

    if (replyTo) {
      payload.reply_to = replyTo._id
    }

    if (selectedUser.public_key) {
      try {
        const encrypted = await encryptMessage(currentMessage, selectedUser.public_key);
        payload = {
          ...payload,
          text: encrypted.text,
          iv: encrypted.iv,
          sender_encrypted_key: encrypted.sender_encrypted_key,
          receiver_encrypted_key: encrypted.receiver_encrypted_key
        };
      } catch (err) {
        console.error("Failed to encrypt message:", err);
      }
    }

    if (
      ws &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(
        JSON.stringify(payload)
      )
    } else {
      console.log("WebSocket disconnected")
    }

    setCurrentMessage("")
    setReplyTo(null)

    setTimeout(() => {
      if (isAtBottom && container) {
        container.scrollTop = container.scrollHeight
      }
    }, 50)
  }

  const getSenderName = (msg) => {
    if (msg.sender_id === myId) return t.you
    return selectedUser.name
  }
  
  const translateMessageText = (text, msgType) => {
    if (text === "deleted_message") return t.deleted_message
    if (text === "audio_message" || msgType === "audio") return t.audio_message
    return text
  }

  const renderReactions = (msg) => {
    if (msg.is_deleted_for_everyone) return null;
    if (!msg.reactions || Object.keys(msg.reactions).length === 0) return null;

    return (
      <div className="message-reactions">
        {Object.entries(msg.reactions).map(([emoji, users]) => {
          const usersList = Array.isArray(users) ? users : [];
          if (usersList.length === 0) return null;

          return (
            <span
              key={emoji}
              className={`reaction-badge ${usersList.includes(user.email) ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                sendReaction(msg._id, emoji);
              }}
              title={usersList.join(', ')}
            >
              {emoji} {usersList.length}
            </span>
          );
        })}
      </div>
    );
  };

  const groupMessagesByDate = (messagesList) => {
    const groups = []
    let lastDate = null
    
    messagesList.forEach((msg, index) => {
      const msgDate = msg.sent_at
      if (!msgDate) return
      
      const isNewDayGroup = isNewDay(lastDate, msgDate)
      
      if (isNewDayGroup) {
        groups.push({
          type: 'date',
          date: msgDate,
          label: formatDateLabel(msgDate, t)
        })
        lastDate = msgDate
      }
      
      groups.push({
        type: 'message',
        message: msg,
        index: index
      })
    })
    
    return groups
  }

  const groupedMessages = groupMessagesByDate(allMessages)

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          {isMobile && (
            <button 
              className="mobile-back-btn"
              onClick={handleMobileBack}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
          )}
          <div className="avatar-with-status">
            <img src={selectedUser.photo} alt="" />
            <div className={`chat-status-dot ${userStatus.is_online ? 'online' : 'offline'}`} />
          </div>
        </div>
        <div className="chat-header-info">
          <h3>{selectedUser.name}</h3>
          <p className="user-status-text">
            {userStatus.is_online ? (
              <span className="online-text">{t.online}</span>
            ) : (
              <span className="offline-text">
                {t.last_seen} {formatLastOnline(userStatus.last_online, t)}
              </span>
            )}
          </p>
        </div>
        <div className="chat-header-actions">
          {/* Тугмаи Voice Call */}
          <button 
            className="header-action-btn" 
            onClick={() => startCall("voice", selectedUser)}
            title={t.voice_call || "Занги овозӣ"}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </button>
          
          {/* Тугмаи Video Call */}
          <button 
            className="header-action-btn" 
            onClick={() => startCall("video", selectedUser)}
            title={t.video_call || "Занги видеоӣ"}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
          </button>
        </div>

        {selectedUser.public_key ? (
          <div className="e2ee-status secure" title={t.e2ee_secure}>
            <span className="lock-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </span>
            <span className="status-text">{t.e2ee_active}</span>
          </div>
        ) : (
          <div className="e2ee-status unsecure" title={t.e2ee_unsecure}>
            <span className="lock-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </span>
            <span className="status-text">{t.e2ee_not_found}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="messages" ref={messagesRef}>
        {isLoadingMore && (
          <div className="loading-more">
            <div className="loading-spinner"></div>
            <span>{t.loading_more}</span>
          </div>
        )}
        
        {groupedMessages.map((item, idx) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${idx}`} className="date-divider">
                <span className="date-label">{item.label}</span>
              </div>
            )
          }
          
          const msg = item.message
          if (msg.is_deleted_for_everyone) {
            return (
              <div
                key={idx}
                className={`deleted-message ${msg.sender_id === myId ? "my-deleted" : "other-deleted"}`}
              >
                <div className="deleted-message-content">
                  <span className="deleted-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', verticalAlign: 'middle'}}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </span>
                  <span className="deleted-text">{t.deleted_message}</span>
                </div>
              </div>
            )
          }

          if (msg.message_type === 'call') {
            const isCompleted = msg.call_status === 'completed';
            const isMissed = msg.call_status === 'missed';
            const isRejected = msg.call_status === 'rejected';
            const isVoice = msg.call_type === 'voice';

            const formatCallDuration = (sec) => {
              if (!sec) return "";
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              return `${m}:${s.toString().padStart(2, "0")}`;
            };

            let callText = "";
            let callIcon = isVoice ? (
              <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: 'middle', marginRight: '6px', display: 'inline-block'}}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: 'middle', marginRight: '6px', display: 'inline-block'}}><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            );
            let statusClass = msg.call_status; // completed, missed, rejected

            if (isVoice) {
              if (isCompleted) {
                callText = `${t.voice_call} - ${formatCallDuration(msg.call_duration)}`;
              } else if (isMissed) {
                callText = `${t.voice_call} (${t.call_missed})`;
              } else {
                callText = `${t.voice_call} (${t.call_rejected})`;
              }
            } else {
              if (isCompleted) {
                callText = `${t.video_call} - ${formatCallDuration(msg.call_duration)}`;
              } else if (isMissed) {
                callText = `${t.video_call} (${t.call_missed})`;
              } else {
                callText = `${t.video_call} (${t.call_rejected})`;
              }
            }

            return (
              <div
                key={idx}
                className={`call-history-message ${msg.sender_id === myId ? "my-call" : "other-call"}`}
              >
                <div className={`call-history-bubble ${statusClass}`}>
                  <span className="call-history-icon">{callIcon}</span>
                  <div className="call-history-content">
                    <span className="call-history-text">{callText}</span>
                    <span className="call-history-time">{formatTime(msg.sent_at)}</span>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={idx}
              className={`${msg.sender_id === myId ? "my-message" : "other-message"} ${editMenu && editMenu.message && editMenu.message._id === msg._id ? "editing" : ""}`}
              onContextMenu={(e) => handleContextMenu(e, msg)}
              onDoubleClick={(e) => handleDoubleClick(e, msg)}
              onTouchStart={(e) => handleTouchStart(e, msg)}
              onTouchEnd={(e) => handleTouchEnd(e, msg)}
              onTouchMove={(e) => handleTouchMove(e, msg)}
              onMouseDown={(e) => handleMouseDown(e, msg)}
              onMouseUp={(e) => handleMouseUp(e, msg)}
              onMouseLeave={(e) => handleMouseLeave(e, msg)}
            >
              {msg.decryptedReply && !msg.decryptedReply.is_deleted_for_everyone && (
                <div className="reply-preview">
                  {(() => {
                    const isAudioReply =
                      msg.decryptedReply?.message_type === 'audio' ||
                      msg.decryptedReply?.duration ||
                      (
                        typeof msg.decryptedReply?.text === 'string' &&
                        msg.decryptedReply.text.includes('webm')
                      )

                    return (
                      <>
                        <div className="reply-header">
                          {msg.decryptedReply.sender_id === myId
                            ? t.you
                            : (msg.decryptedReply.sender_name || selectedUser.name)}
                        </div>

                        <div className="reply-text">
                          {isAudioReply ? (
                            t.audio_message
                          ) : msg.decryptedReply.message_type === 'text' ? (
                            <MessageTextWithLinks text={msg.decryptedReply.decryptedText || msg.decryptedReply.text} t={t} isEdited={false} />
                          ) : (
                            translateMessageText(msg.decryptedReply.decryptedText || msg.decryptedReply.text, msg.decryptedReply.message_type)
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {msg.decryptedReply && msg.decryptedReply.is_deleted_for_everyone && (
                <div className="reply-preview deleted-reply">
                  <div className="reply-header">
                    {msg.decryptedReply.message_type === 'audio'
                      ? t.audio_message
                      : (msg.decryptedReply.sender_id === myId
                          ? t.you
                          : (msg.decryptedReply.sender_name || selectedUser.name)
                        )
                    }
                  </div>
                  <div className="reply-text deleted-text">
                    🗑️ {t.deleted_message}
                  </div>
                </div>
              )}

              <div className="message-content">
                {msg.message_type === 'audio' ? (
                  <AudioPlayer msg={msg} myId={myId} t={t} />
                ) : msg.message_type === 'text' ? (
                  editMenu && editMenu.message && editMenu.message._id === msg._id ? (
                    <div className="inline-edit-container" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className="inline-edit-textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        autoFocus
                        rows={2}
                      />
                      <div className="inline-edit-buttons">
                        <button className="inline-edit-btn cancel" onClick={closeEditMenu} title={t.cancel}>
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <button className="inline-edit-btn save" onClick={handleEditSubmit} title={t.save}>
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MessageTextWithLinks text={msg.decryptedText || msg.text} t={t} isEdited={msg.is_edited} />
                  )
                ) : (
                  translateMessageText(msg.decryptedText || msg.text, msg.message_type)
                )}
              </div>

              {renderReactions(msg)}

              {!(editMenu && editMenu.message && editMenu.message._id === msg._id) && (
                <div className="message-footer">
                  {msg.sender_id === myId && (
                    <div className="message-status">
                      {msg.is_read ? (
                        <span className="checkmark read" title={t.read}>✓✓</span>
                      ) : (
                        <span className="checkmark sent" title={t.sent}>✓</span>
                      )}
                    </div>
                  )}
                  <div className="message-time">
                    {formatTime(msg.sent_at)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <div className="reply-bar-header">
              {t.reply_to} {getSenderName(replyTo)}
            </div>
            <div className="reply-bar-text">
              {replyTo.message_type === 'audio'
                ? t.audio_message
                : translateMessageText(replyTo.decryptedText || replyTo.text, replyTo.message_type).substring(0, 100)
              }
            </div>
          </div>
          <button className="reply-bar-cancel" onClick={cancelReply}>
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-wrapper">
        <div className="chat-input-bar">
          {!isRecording ? (
            <button
              className="mic-button"
              onClick={startRecording}
              title={t.recording}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </button>
          ) : (
            <button 
              className="cancel-recording-btn" 
              onClick={cancelRecording} 
              title={t.cancel}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}

          {isRecording ? (
            <div className="recording-status-bar">
              <span className="recording-pulsing-dot"></span>
              <span className="recording-time-text">{formatRecordingTime(recordingTime)}</span>
              <span className="recording-hint-text">🎤 Сабти овоз...</span>
            </div>
          ) : (
            <input
              type="text"
              placeholder={replyTo ? `${t.reply_to}...` : t.typeMessage}
              value={getCurrentMessage()}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  sendMessage()
                }
              }}
            />
          )}

          {isRecording ? (
            <button 
              className="send-recording-btn" 
              onClick={stopRecording} 
              title={t.send_recording}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          ) : (
            <button 
              className="send-msg-btn" 
              onClick={sendMessage} 
              title={t.send}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          )}
        </div>
      </div>

      {/* Reaction Menu */}
      {reactionMenu && (
        <div
          className="reaction-menu"
          ref={reactionMenuRef}
          style={{
            position: 'fixed',
            left: reactionMenu.x + 'px',
            top: reactionMenu.y + 'px',
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="reaction-emoji-container">
            <div className="reaction-emoji-scroll" ref={reactionScrollRef}>
              {EMOJI_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="reaction-emoji-btn"
                  onClick={() => handleReactionClick(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="reaction-menu-reply" onClick={handleReplyFromMenu}>
            <span className="reply-icon">↩️</span>
            <span>{t.reply}</span>
          </div>

          {reactionMenu.message?.message_type !== 'audio' && !reactionMenu.message?.is_deleted_for_everyone && (
            <div className="reaction-menu-copy" onClick={handleCopyText}>
              <span className="copy-icon">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              </span>
              <span>{t.copy_text}</span>
            </div>
          )}

          {reactionMenu.message?.sender_id === myId && 
           reactionMenu.message?.message_type === 'text' && 
           !reactionMenu.message?.is_deleted_for_everyone && (
            <div className="reaction-menu-edit" onClick={() => openEditMenu(reactionMenu.message)}>
              <span className="edit-icon">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
              </span>
              <span>{t.edit}</span>
            </div>
          )}

          {!reactionMenu.message?.is_deleted_for_everyone && (
            <div className="reaction-menu-delete" onClick={() => openDeleteMenuForMessage(reactionMenu.message)}>
              <span className="delete-icon">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </span>
              <span>{t.only_delete}</span>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteMenu && (
        <div className="delete-modal-overlay" onClick={closeDeleteMenu}>
          <div className="delete-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-warning-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
            
            <h3 className="delete-modal-title">
              {language === 'tg' ? "Ҳазфи паём" : 
               language === 'ru' ? "Удаление сообщения" : 
               language === 'fa' ? "حذف پیام" : "Delete Message"}
            </h3>
            <p className="delete-modal-subtitle">
              {language === 'tg' ? "Оё мехоҳед ин паёмро ҳазф кунед?" :
               language === 'ru' ? "Вы действительно хотите удалить это сообщение?" :
               language === 'fa' ? "آیا می‌خواهید این پیام را حذف کنید؟" : "Are you sure you want to delete this message?"}
            </p>
            
            <div className="delete-modal-options">
              <div className="delete-modal-option-card" onClick={handleDeleteForMe}>
                <div className="option-card-header">
                  <span className="option-card-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </span>
                  <span className="option-card-title">{t.delete_for_me}</span>
                </div>
                <p className="option-card-desc">{t.delete_hint_me}</p>
              </div>
              
              {deleteMenu.message?.sender_id === myId && (
                <div className="delete-modal-option-card warning" onClick={handleDeleteForEveryone}>
                  <div className="option-card-header">
                    <span className="option-card-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    </span>
                    <span className="option-card-title">{t.delete_for_everyone}</span>
                  </div>
                  <p className="option-card-desc">{t.delete_hint_everyone}</p>
                </div>
              )}
            </div>
            
            <button className="delete-modal-cancel-btn" onClick={closeDeleteMenu}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            )}
          </span>
          {toast.message}
        </div>
      )}

    </div>
  )
}

export default Chat