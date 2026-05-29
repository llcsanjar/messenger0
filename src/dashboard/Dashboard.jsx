import {
  useEffect,
  useState,
  useRef
} from "react"

import {
  useNavigate,
  useParams,
  useLocation
} from "react-router-dom"

import { auth } from "../registration/firebase"

import { API_URL } from "../config"

import Chat from "./Chat"
import CallUI from "./CallUI"
import {
  requestNotificationPermission
} from "../registration/firebase"

import "./Dashboard.css"
import { getSavedLanguage, saveLanguage, getTranslation } from "../translations"

function Dashboard() {

  const user = auth.currentUser
  const navigate = useNavigate()
  const location = useLocation()
  const { email_name } = useParams()

  const sidebarRef = useRef(null)
  const dashboardRef = useRef(null)

  const [users, setUsers] = useState([])
  const [searchUsers, setSearchUsers] = useState([])
  const [search, setSearch] = useState("")
  const [selectedUser, setSelectedUser] = useState(null)
  const [openModal, setOpenModal] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [unreadUsers, setUnreadUsers] = useState([])
  const [onlineUsers, setOnlineUsers] = useState({})
  const [callSession, setCallSession] = useState(null)
  
  const startCall = (callType, peerUser) => {
    setCallSession({
      type: "outgoing",
      callType: callType,
      peer: peerUser
    })
  }
  
  // Mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [sidebarVisible, setSidebarVisible] = useState(true)

  // Language
  const [language, setLanguage] = useState(getSavedLanguage())
  const t = getTranslation(language)

  const usersRef = useRef(users);
  const selectedUserRef = useRef(selectedUser);
  const wsRef = useRef(null);
  const activeChatListenerRef = useRef(null);

  // Check screen size for mobile
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (!mobile) {
        setSidebarVisible(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle mobile sidebar visibility when chat is opened/closed
  useEffect(() => {
    if (isMobile) {
      if (selectedUser) {
        setSidebarVisible(false)
      } else {
        setSidebarVisible(true)
      }
    }
    
    // Add/remove class for mobile styling
    if (dashboardRef.current) {
      if (selectedUser && isMobile) {
        dashboardRef.current.classList.add('chat-open')
      } else {
        dashboardRef.current?.classList.remove('chat-open')
      }
    }
  }, [selectedUser, isMobile])

  // Handle browser back button - mobile navigation without reload
  useEffect(() => {
    const handlePopState = (event) => {
      if (isMobile && selectedUser) {
        event.preventDefault()
        handleBackToChatList()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isMobile, selectedUser])

  // Handle back to chat list (sidebar) - бе reload
  const handleBackToChatList = () => {
    setSelectedUser(null)
    setSidebarVisible(true)
    
    window.history.pushState(null, '', '/dashboard')
    
    if (dashboardRef.current) {
      dashboardRef.current.classList.remove('chat-open')
    }
  }

  // Handle mobile back button click
  const handleMobileBack = () => {
    handleBackToChatList()
  }

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  const changeLanguage = (newLang) => {
    setLanguage(newLang)
    saveLanguage(newLang)
    setOpenModal(false)
    setTimeout(() => {
      setOpenModal(true)
    }, 50)
  }

  const loadUserStatuses = async () => {
    try {
      const response = await fetch(`${API_URL}/user-statuses`)
      const statuses = await response.json()
      setOnlineUsers(statuses)
      
      setUsers(prev => prev.map(u => {
        const status = statuses[u.email]
        if (status) {
          return {
            ...u,
            is_online: status.is_online,
            last_online: status.last_online
          }
        }
        return u
      }))
    } catch (error) {
      console.error("Error loading user statuses:", error)
    }
  }

  const getSortedUsers = () => {
    if (search.trim()) return searchUsers;

    const unread = [];
    const read = [];

    users.forEach((u) => {
      if (unreadUsers.includes(u._id)) {
        unread.push(u);
      } else {
        read.push(u);
      }
    });

    return [...unread, ...read];
  };

  const loadUsers = async (currentPage = 0) => {
    const response = await fetch(
      `${API_URL}/chat-users/${user.email}?page=${currentPage}`
    )
    const data = await response.json()

    if (data.length < 10) {
      setHasMore(false)
    }

    const unreadIds = data.filter(item => item.has_unread).map(item => item._id);
    if (unreadIds.length > 0) {
      setUnreadUsers((prev) => [
        ...new Set([...prev, ...unreadIds])
      ]);
    }

    setUsers((prev) => {
      const ids = new Set(prev.map(item => item._id))
      const newUsers = data.filter(item => !ids.has(item._id))
      return [...prev, ...newUsers]
    })
  }

  useEffect(() => {
    loadUsers(0)
    loadUserStatuses()
  }, [])

  const handleScroll = () => {
    const element = sidebarRef.current
    if (!element || !hasMore) return
    const isBottom = (
      element.scrollTop + element.clientHeight >= element.scrollHeight - 50
    )
    if (isBottom) {
      const nextPage = page + 1
      setPage(nextPage)
      loadUsers(nextPage)
    }
  }

  useEffect(() => {
    if (!search.trim()) {
      setSearchUsers([])
      return
    }
    fetch(`${API_URL}/search-users?q=${search}`)
      .then(res => res.json())
      .then(data => {
        setSearchUsers(data)
      })
  }, [search])

  // Open direct URL chat (масалан /messages/email@example.com)
  useEffect(() => {
    if (!email_name) return
    
    fetch(`${API_URL}/find-user/${email_name}`)
      .then(res => res.json())
      .then(foundUser => {
        if (!foundUser?._id) return
        setSelectedUser(foundUser)
        setUsers((prev) => {
          const exists = prev.find(item => item._id === foundUser._id)
          if (exists) return prev
          return [foundUser, ...prev]
        })
        
        if (isMobile) {
          setSidebarVisible(false)
        }
      })
  }, [email_name])

  // ============ WEBSOCKET ASOSI (DAR DASHBOARD) ============
  useEffect(() => {
    if (!user?.email) return

    // Танзими протоколи WebSocket (ws:// барои локалӣ, wss:// барои продакшн)
    const isSecure = API_URL.startsWith("https://") || window.location.protocol === "https:"
    const wsProtocol = isSecure ? "wss://" : "ws://"
    const cleanApiUrl = API_URL.replace(/^https?:\/\//, "")
    const wsUrl = `${wsProtocol}${cleanApiUrl}/ws/chat`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    let isConnected = false

    ws.onopen = () => {
      console.log("WebSocket connected from Dashboard")
      ws.send(JSON.stringify({
        type: "auth",
        email: user.email,
        source: "dashboard",
        language: language
      }))
      isConnected = true
      loadUserStatuses()
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)

      // Incoming call handling
      if (data.type === "incoming_call") {
        setCallSession({
          type: "incoming",
          callType: data.call_type,
          peer: {
            _id: data.sender_id,
            email: data.sender_email,
            name: data.sender_name,
            photo: data.sender_photo
          }
        })
        return
      }

      // 1. User status updates
      if (data.type === "user_status") {
        setOnlineUsers(prev => ({
          ...prev,
          [data.user_email]: {
            is_online: data.is_online,
            last_online: data.last_online
          }
        }))
        
        setUsers(prev => prev.map(u => {
          if (u.email === data.user_email) {
            return {
              ...u,
              is_online: data.is_online,
              last_online: data.last_online
            }
          }
          return u
        }))
        return
      }

      // 2. Read receipts - инро барои навсозии статуси хондан истифода баред
      if (data.type === "read") {
        // Метавонед ин ҷо баъзе логика барои навсозии UI илова кунед
        return
      }

      // 3. New messages - ТАНҲО ПАЁМҲОИ ВОРИДОТӢ
      // ТАФТИШИ МУҲИМ: оё ин паём ба ман фиристода шудааст?
      if (data.receiver_email === user.email) {
        // Ин паёмест, ки ба МАН фиристода шудааст
        console.log("Received message from:", data.sender_id)
        
        let target = usersRef.current.find(
          item => item._id === data.sender_id
        )

        if (!target && data.sender_id) {
          try {
            const response = await fetch(`${API_URL}/user-by-id/${data.sender_id}`)
            target = await response.json()
          } catch (error) {
            console.log(error)
            return
          }
        }

        if (target) {
          // Инфиродро ба болои рӯйхат гузоред
          setUsers((prev) => {
            const filtered = prev.filter(item => item._id !== data.sender_id)
            return [target, ...filtered]
          })

          // ТАНҲО агар чати ин корбар кушода набошад, unread-dot гузоред
          if (selectedUserRef.current?._id !== data.sender_id) {
            setUnreadUsers((prev) => [
              ...new Set([...prev, data.sender_id])
            ])
          } else {
            // Агар чат кушода бошад, паёмро ҳамчун хонда қайд кунед
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "read",
                sender_email: user.email,
                receiver_id: data.sender_id
              }))
            }
          }
        }
      }
      // Агар data.receiver_email ба user.email баробар НАБОШАД,
      // ин паёмест, ки ХУДИ МАН фиристодаам ва ҳеҷ коре набояд кард
    }

    ws.onclose = () => {
      console.log("WebSocket disconnected from Dashboard")
      isConnected = false
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "dashboard_close",
          email: user.email
        }))
        ws.close()
      }
    }
  }, [user?.email])

  // Helper function for Chat component to update messages
  const [allMessagesInChat, setAllMessagesInChat] = useState(null)
  const [myId, setMyId] = useState(null)

  const openChat = (item) => {
    if (selectedUser?._id === item._id) {
      if (isMobile && !sidebarVisible) {
        setSidebarVisible(false)
      }
      return
    }
    
    setSelectedUser(item)
    setUnreadUsers((prev) => prev.filter(id => id !== item._id))
    
    const newUrl = `/messages/${encodeURIComponent(item.email)}`
    window.history.pushState(null, '', newUrl)
    
    if (isMobile) {
      setSidebarVisible(false)
    }
  }

  return (
    <div className="dashboard" ref={dashboardRef}>
      {/* Sidebar */}
      <div className={`sidebar ${isMobile && !sidebarVisible ? 'sidebar-hidden' : ''}`}>
        <div className="top-bar">
          <img
            src={user?.photoURL}
            alt=""
            className="my-profile"
            onClick={() => setOpenModal(true)}
          />
          <input
            type="text"
            placeholder={t.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div
          className="users"
          ref={sidebarRef}
          onScroll={handleScroll}
        >
          {getSortedUsers().map((item, index) => (
            <div
              key={index}
              onClick={() => openChat(item)}
              className={
                selectedUser?._id === item._id
                  ? "user-card active-user"
                  : "user-card"
              }
            >
              <div className="avatar-wrapper">
                <img
                  src={item.photo}
                  alt=""
                  style={{
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
                <div className={`status-dot ${onlineUsers[item.email]?.is_online ? 'online' : 'offline'}`} />
              </div>

              <div>
                <h3>{item.name}</h3>
                <p>{item.email}</p>
              </div>

              {unreadUsers.includes(item._id) && (
                <div className="unread-dot" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="main">
        {selectedUser ? (
          <Chat
            key={selectedUser._id}
            selectedUser={selectedUser}
            onlineUsers={onlineUsers}
            ws={wsRef.current}
            language={language}
            handleMobileBack={handleMobileBack}
            startCall={startCall}
          />
        ) : (
          (!isMobile || !sidebarVisible) && (
            <h1 style={{ textAlign: 'center', padding: '20px' }}>
              {t.messenger}
            </h1>
          )
        )}
      </div>

      {/* Profile Modal */}
      {openModal && (
        <div
          className="modal-overlay"
          onClick={() => setOpenModal(false)}
        >
          <div
            className="modal language-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={user?.photoURL} alt="Profile" />
            <h2>{user?.displayName}</h2>
            <p>{user?.email}</p>
            
            <div className="language-selector">
              <h4>{t.selectLanguage}</h4>
              <div className="language-buttons">
                <button 
                  className={`lang-btn ${language === 'tg' ? 'active-lang' : ''}`}
                  onClick={() => changeLanguage('tg')}
                >
                  {t.tajik}
                </button>
                <button 
                  className={`lang-btn ${language === 'ru' ? 'active-lang' : ''}`}
                  onClick={() => changeLanguage('ru')}
                >
                  {t.russian}
                </button>
                <button 
                  className={`lang-btn ${language === 'en' ? 'active-lang' : ''}`}
                  onClick={() => changeLanguage('en')}
                >
                  {t.english}
                </button>
                <button 
                  className={`lang-btn ${language === 'fa' ? 'active-lang' : ''}`}
                  onClick={() => changeLanguage('fa')}
                >
                  {t.persian}
                </button>
              </div>
            </div>
            
            <button 
              className="close-modal-btn"
              onClick={() => setOpenModal(false)}
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
      
      {callSession && (
        <CallUI
          session={callSession}
          ws={wsRef.current}
          myEmail={user.email}
          onCallEnd={() => setCallSession(null)}
          t={t}
        />
      )}
    </div>
  )
}

export default Dashboard