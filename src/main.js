// 학생 활동 페이지 메인 로직
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig.js';

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ChatGPT API Key (.env에서 불러오기)
const CHATGPT_API_KEY = import.meta.env.VITE_CHATGPT_API_KEY;
const CHATGPT_API_URL = 'https://api.openai.com/v1/chat/completions';

// 상태 관리
let currentUser = null;
let chatHistory = [];
let messageCount = 0;
let selectedEmotion = null;
let uploadedImage = null;
let chatStartTime = null; // 첫 대화 시작 시간
let chatEndTime = null; // 대화 끝내기 버튼 클릭 시간

// 일기 작성 관련 상태
let diaryContent = '';
let selectedEmotionIcon = null; // 선택한 감정 이모티콘
let studyHours = 0; // 공부 시간 (시간)
let studyMinutes = 0; // 공부 시간 (분)
let problemType = 'photo'; // 'photo', 'text', 'draw'
let problemImage = null;
let problemText = '';
let problemDrawing = null; // Canvas 이미지 데이터
let problemExplanation = '';
let drawingCanvas = null;
let drawingContext = null;
let isDrawing = false;

// 테스트 모드: 선택한 날짜 (URL 쿼리 파라미터에서 가져옴)
let selectedDate = null;

// DOM 요소
const userInfoHeader = document.getElementById('user-info-header');
const chatbotSection = document.getElementById('chatbot-section');
const diarySection = document.getElementById('diary-section');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const endChatBtn = document.getElementById('end-chat-btn');
const diaryDate = document.getElementById('diary-date');
const diaryContentTextarea = document.getElementById('diary-content');
const problemImageInput = document.getElementById('problem-image');
const problemImagePreview = document.getElementById('problem-image-preview');
const problemTextarea = document.getElementById('problem-text');
const problemExplanationTextarea = document.getElementById('problem-explanation');
const submitBtn = document.getElementById('submit-btn');

// 사용자 정보 표시
function displayUserInfo(user) {
  // 모달 모드인 경우 헤더 숨기기
  const urlParams = new URLSearchParams(window.location.search);
  const isModal = urlParams.get('modal') === 'true';
  
  if (isModal) {
    // 모달 모드: 헤더와 뒤로가기 버튼 숨기기
    const header = document.querySelector('.student-header');
    if (header) {
      header.style.display = 'none';
    }
    if (userInfoHeader) {
      userInfoHeader.style.display = 'none';
    }
  } else if (userInfoHeader && user) {
    userInfoHeader.innerHTML = `
      <div class="user-info-card">
        <p><strong>${user.displayName || '사용자'}</strong></p>
        <p class="user-email">${user.email}</p>
    </div>
    `;
  }
}

// 테스트 모드 확인 함수
function isTestMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('test') === 'student';
}

// 인증 확인
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // 로그인되지 않은 경우 홈으로 리다이렉트
    window.location.href = 'index.html';
  } else {
    currentUser = user;
    displayUserInfo(user);
    
    // URL 쿼리 파라미터에서 날짜 정보 가져오기 (테스트 모드)
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');
    const yearParam = urlParams.get('year');
    const monthParam = urlParams.get('month');
    const dayParam = urlParams.get('day');
    
    if (dateParam && yearParam && monthParam && dayParam) {
      // 선택한 날짜로 설정
      const year = parseInt(yearParam);
      const month = parseInt(monthParam);
      const day = parseInt(dayParam);
      
      // 날짜 유효성 검사
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        console.error('잘못된 날짜 형식:', { yearParam, monthParam, dayParam });
      } else if (month < 1 || month > 12 || day < 1 || day > 31) {
        console.error('날짜 범위 오류:', { year, month, day });
      } else {
        selectedDate = {
          date: dateParam,
          year: year,
          month: month,
          day: day
        };
        console.log('테스트 모드: 선택한 날짜', selectedDate);
      }
    }
    
    // 테스트 모드인 경우 챗봇 생략하고 일기 섹션 바로 표시
    if (isTestMode()) {
      chatbotSection.style.display = 'none';
      diarySection.style.display = 'block';
      
      // 날짜 표시
      let displayDate;
      if (selectedDate) {
        displayDate = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.day);
      } else {
        displayDate = new Date();
      }
      
      const year = displayDate.getFullYear();
      const month = String(displayDate.getMonth() + 1).padStart(2, '0');
      const day = String(displayDate.getDate()).padStart(2, '0');
      const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
      const weekday = weekdays[displayDate.getDay()];
      
      if (diaryDate) {
        diaryDate.textContent = `${year}년 ${month}월 ${day}일 (${weekday}) [테스트 모드]`;
        diaryDate.style.color = '#FF9800';
      }
      
      // 챗봇 시간 초기화 (테스트 모드에서는 사용하지 않음)
      chatStartTime = new Date();
      chatEndTime = new Date();
    } else {
      // 일반 모드: 초기 챗봇 메시지 표시
      addChatMessage('bot', '안녕! 선생님이야. 오늘 하루 어떻게 보냈는지, 수학 공부하면서 어떤 생각이나 감정을 느꼈는지 편하게 이야기해보자. 선생님이 들어볼게! 😊');
    }
  }
});

// ChatGPT API 호출
async function callChatGPT(userMessage) {
  if (!CHATGPT_API_KEY) {
    console.error('ChatGPT API Key가 설정되지 않았습니다. .env 파일에 VITE_CHATGPT_API_KEY를 설정해주세요.');
    return '죄송합니다. 챗봇 서비스가 준비되지 않았습니다.';
  }

  try {
    // 대화 히스토리에 사용자 메시지 추가
    chatHistory.push({
      role: 'user',
      content: userMessage
    });

    const response = await fetch(CHATGPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHATGPT_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `당신은 친근하고 따뜻한 고등학교 수학교사야. 학생이 오늘 하루를 어떻게 보냈는지, 수학 공부하면서 어떤 생각이나 감정을 느꼈는지 이야기하면, 그것을 듣고 따뜻하게 피드백을 주는 역할이야.

중요: 반드시 반말로 대화해야 해. 존댓말은 절대 사용하지 마.

주요 특징:
- 항상 친근하고 자연스러운 반말 톤을 사용해 ("~하자", "~해", "~했어", "~하니", "~구나", "~지", "~야" 등)
- 학생이 말한 내용을 잘 듣고 이해했다는 것을 보여줘 ("~했다고 했는데...", "~한 느낌이 들었구나" 등)
- 학생의 감정과 경험에 깊이 공감해
- 학생의 이야기에 대해 구체적이고 의미 있는 피드백을 제공해
- 응원과 격려를 아끼지 않아 ("정말 잘하고 있어!", "훌륭해!", "대단하다!", "고생했어!" 등)
- 어려움을 겪고 있을 때는 위로와 격려를 제공해
- 수학 공부에 대한 긍정적인 시각과 동기부여를 전달해

대화 스타일:
- 학생이 말한 내용을 반영하여 응답해 ("~했다고 했는데...", "~한 느낌이 들었구나" 등)
- 짧고 명확한 문장을 사용해 (한 번에 2-4문장 정도)
- 이모티콘을 적절히 사용해서 따뜻함을 전달해
- 학생의 감정 상태에 맞춰 응답해
- 수학에 대한 부담을 덜어주고 긍정적인 시각을 제시해
- 학생이 자신감을 가질 수 있도록 격려해
- 절대 존댓말을 사용하지 말고, 항상 반말로 친근하게 대화해

학생의 이야기를 진심으로 듣고, 그에 대해 따뜻하고 구체적인 피드백을 주는 선생님으로 반말로 대화해.`
          },
          ...chatHistory
        ],
        max_tokens: 250,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    const botMessage = data.choices[0].message.content;

    // 대화 히스토리에 봇 응답 추가
    chatHistory.push({
      role: 'assistant',
      content: botMessage
    });

    return botMessage;
  } catch (error) {
    console.error('ChatGPT API 오류:', error);
    return '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

// 채팅 메시지 추가
function addChatMessage(sender, message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  messageContent.textContent = message;
  
  messageDiv.appendChild(messageContent);
  chatMessages.appendChild(messageDiv);
  
  // 스크롤을 맨 아래로
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 메시지 전송
async function sendMessage() {
  const userMessage = chatInput.value.trim();
  
  if (!userMessage) return;

  // 첫 메시지인 경우 시작 시간 기록
  if (!chatStartTime) {
    chatStartTime = new Date();
  }

  // 사용자 메시지 표시
  addChatMessage('user', userMessage);
  chatInput.value = '';
  sendBtn.disabled = true;

  // ChatGPT 응답 받기
  const botResponse = await callChatGPT(userMessage);
  addChatMessage('bot', botResponse);

  sendBtn.disabled = false;
  chatInput.focus();

  // 메시지 카운트 증가
  messageCount++;

  // 1회 이상 대화했으면 '대화 끝내기' 버튼 표시 (최대 3회까지)
  if (messageCount >= 1 && messageCount <= 3) {
    endChatBtn.style.display = 'block';
  }
  
  // 3회 대화 후 자동으로 대화 종료 안내
  if (messageCount >= 3) {
    setTimeout(() => {
      addChatMessage('bot', '고마워! 오늘 하루 이야기 들려줘서 정말 좋았어. 이제 일기를 작성해보자! 😊');
    }, 1000);
  }
}

// 대화 끝내기
function endChat() {
  chatEndTime = new Date();
  chatbotSection.style.display = 'none';
  diarySection.style.display = 'block';
  
  // 오늘 날짜 표시
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[today.getDay()];
  
  if (diaryDate) {
    diaryDate.textContent = `${year}년 ${month}월 ${day}일 ${weekday}요일`;
  }
  
  // 그림 그리기 Canvas 초기화
  initDrawingCanvas();
}

// 그림 그리기 Canvas 초기화
function initDrawingCanvas() {
  drawingCanvas = document.getElementById('drawing-canvas');
  if (!drawingCanvas) return;
  
  drawingContext = drawingCanvas.getContext('2d');
  
  // Canvas 크기 설정
  const rect = drawingCanvas.getBoundingClientRect();
  drawingCanvas.width = rect.width;
  drawingCanvas.height = 400;
  
  // 배경을 흰색으로 설정
  drawingContext.fillStyle = 'white';
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  
  // 그리기 설정
  drawingContext.strokeStyle = '#000';
  drawingContext.lineWidth = 2;
  drawingContext.lineCap = 'round';
  drawingContext.lineJoin = 'round';
  
  // 기존 이벤트 리스너 제거 (중복 방지)
  const newCanvas = drawingCanvas.cloneNode(true);
  drawingCanvas.parentNode.replaceChild(newCanvas, drawingCanvas);
  drawingCanvas = newCanvas;
  
  // 마우스 이벤트
  drawingCanvas.addEventListener('mousedown', startDrawing);
  drawingCanvas.addEventListener('mousemove', draw);
  drawingCanvas.addEventListener('mouseup', stopDrawing);
  drawingCanvas.addEventListener('mouseout', stopDrawing);
  
  // 터치 이벤트 (모바일)
  drawingCanvas.addEventListener('touchstart', handleTouch, { passive: false });
  drawingCanvas.addEventListener('touchmove', handleTouch, { passive: false });
  drawingCanvas.addEventListener('touchend', stopDrawing);
  
  // Context 다시 가져오기
  drawingContext = drawingCanvas.getContext('2d');
  
  // 배경을 다시 흰색으로 설정 (cloneNode 후에는 배경이 사라질 수 있음)
  drawingContext.fillStyle = 'white';
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  
  // 그리기 설정
  drawingContext.strokeStyle = '#000';
  drawingContext.lineWidth = 2;
  drawingContext.lineCap = 'round';
  drawingContext.lineJoin = 'round';
}

function startDrawing(e) {
  isDrawing = true;
  const rect = drawingCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  drawingContext.beginPath();
  drawingContext.moveTo(x, y);
}

function draw(e) {
  if (!isDrawing) return;
  const rect = drawingCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  drawingContext.lineTo(x, y);
  drawingContext.stroke();
}

function stopDrawing() {
  isDrawing = false;
}

function handleTouch(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 
                                     e.type === 'touchmove' ? 'mousemove' : 'mouseup', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  drawingCanvas.dispatchEvent(mouseEvent);
}

// 탭 전환
function switchTab(tabName) {
  // 모든 탭 버튼과 콘텐츠 비활성화
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // 선택한 탭 활성화
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  problemType = tabName;
  
  // Canvas 크기 조정 (그림 탭일 때)
  if (tabName === 'draw') {
    setTimeout(() => {
      initDrawingCanvas();
    }, 100);
  }
}

// 이미지 업로드 처리
function handleImageUpload(event) {
  const file = event.target.files[0];
  
  if (!file) return;

  // 파일 크기 체크 (5MB 제한)
  if (file.size > 5 * 1024 * 1024) {
    alert('이미지 파일 크기는 5MB 이하여야 합니다.');
    return;
  }

  problemImage = file;

  // 이미지 미리보기
  const reader = new FileReader();
  reader.onload = (e) => {
    problemImagePreview.innerHTML = `
      <img src="${e.target.result}" alt="문제 이미지" class="preview-image-new" />
      <button class="remove-image-btn" onclick="removeProblemImage()">✕</button>
    `;
  };
  reader.readAsDataURL(file);
}

// 이미지 제거
window.removeProblemImage = function() {
  problemImage = null;
  problemImageInput.value = '';
  problemImagePreview.innerHTML = '';
};

// 그림 저장
function saveDrawing() {
  if (!drawingCanvas) {
    alert('그림을 그릴 수 없습니다. 페이지를 새로고침해주세요.');
    return;
  }
  problemDrawing = drawingCanvas.toDataURL('image/png');
  alert('그림이 저장되었습니다!');
}

// Canvas 지우기
function clearCanvas() {
  if (!drawingContext || !drawingCanvas) return;
  drawingContext.fillStyle = 'white';
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
}

// 이미지를 JPG로 변환
function convertToJPG(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          const jpgFile = new File([blob], `problem_${Date.now()}.jpg`, { type: 'image/jpeg' });
          resolve(jpgFile);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 이미지를 Storage에 업로드
async function uploadImageToStorage(imageFile) {
  try {
    // JPG로 변환
    const jpgFile = await convertToJPG(imageFile);
    
    // Storage 경로 생성
    const storageRef = ref(storage, `problem_images/${currentUser.uid}/${Date.now()}_${jpgFile.name}`);
    
    // 업로드
    const snapshot = await uploadBytes(storageRef, jpgFile);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('이미지 업로드 실패:', error);
    throw error;
  }
}

// 대화 시간 계산 (초 단위)
function calculateChatDuration() {
  if (!chatStartTime || !chatEndTime) {
    return 0;
  }
  return Math.floor((chatEndTime - chatStartTime) / 1000); // 초 단위
}

// 날짜와 시간 포맷팅 (시, 분까지만)
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    year,
    month,
    day,
    hours,
    minutes
  };
}

// 이모티콘 선택
function selectEmotionIcon(emotion, targetElement) {
  selectedEmotionIcon = emotion;
  
  // 모든 이모티콘 버튼에서 선택 상태 제거
  document.querySelectorAll('.emotion-select-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // 선택한 버튼에 선택 상태 추가
  if (targetElement) {
    targetElement.classList.add('selected');
  }
  
  // 선택한 이모티콘 표시
  const displayElement = document.getElementById('selected-emotion-display');
  if (displayElement) {
    displayElement.textContent = `선택한 감정: ${emotion}`;
    displayElement.style.display = 'block';
  }
}

// 제출하기
async function handleSubmit() {
  // 테스트 모드 확인
  const testMode = isTestMode();
  
  // 유효성 검사 (테스트 모드에서는 이모티콘만 있어도 제출 가능)
  if (!testMode) {
    // 일반 모드: 모든 필수 항목 검사
    if (!diaryContentTextarea.value.trim()) {
      alert('일기 내용을 작성해주세요.');
      return;
    }
  }

  if (!selectedEmotionIcon) {
    alert('오늘의 감정 이모티콘을 선택해주세요.');
    return;
  }

  if (!currentUser) {
    alert('로그인이 필요합니다.');
    return;
  }

  // 문제 입력 확인
  let problemData = null;
  let problemImageURL = null;
  
  if (problemType === 'photo') {
    if (!problemImage) {
      if (!testMode) {
        alert('문제 사진을 업로드해주세요.');
        return;
      }
      // 테스트 모드에서는 문제 없이도 제출 가능
    } else {
      try {
        problemImageURL = await uploadImageToStorage(problemImage);
        
        if (!problemImageURL) {
          throw new Error('이미지 업로드 실패: URL을 받지 못했습니다.');
        }
        
        problemData = { type: 'photo', imageURL: problemImageURL };
      } catch (error) {
        console.error('사진 업로드 실패:', error);
        if (!testMode) {
          alert('사진 업로드 중 오류가 발생했습니다. 다시 시도해주세요.');
          submitBtn.disabled = false;
          submitBtn.textContent = '제출하기';
          return;
        }
        // 테스트 모드에서는 업로드 실패해도 계속 진행
      }
    }
  } else if (problemType === 'text') {
    if (!problemTextarea.value.trim()) {
      if (!testMode) {
        alert('문제를 텍스트로 작성해주세요.');
        return;
      }
      // 테스트 모드에서는 문제 없이도 제출 가능
    } else {
      problemData = { type: 'text', content: problemTextarea.value.trim() };
    }
  } else if (problemType === 'draw') {
    // problemDrawing 변수에 저장된 이미지가 있는지 먼저 확인
    const hasSavedDrawing = problemDrawing && problemDrawing.length > 0 && problemDrawing !== 'data:,';
    
    if (!drawingCanvas && !hasSavedDrawing) {
      if (!testMode) {
        alert('그림을 그릴 수 없습니다. 페이지를 새로고침해주세요.');
        return;
      }
      // 테스트 모드에서는 문제 없이도 제출 가능
    } else {
      let isEmpty = true;
      let useSavedDrawing = false;
      
      // 저장된 그림이 있으면 그것을 사용
      if (hasSavedDrawing) {
        isEmpty = false;
        useSavedDrawing = true;
      } else if (drawingCanvas) {
        // drawingContext가 없으면 다시 가져오기
        if (!drawingContext) {
          drawingContext = drawingCanvas.getContext('2d');
        }
        
        // Canvas가 비어있는지 확인
        try {
          const imageData = drawingContext.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
          const data = imageData.data;
          
          // 픽셀 데이터 확인 (처음 1000개 픽셀만 샘플링하여 성능 최적화)
          const sampleSize = Math.min(1000, data.length / 4);
          for (let i = 0; i < sampleSize * 4; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            // 완전히 흰색이 아니거나 투명하지 않은 픽셀이 있으면 그림이 있음
            if (!(r === 255 && g === 255 && b === 255) || a < 255) {
              isEmpty = false;
              break;
            }
          }
        } catch (error) {
          console.error('Canvas 이미지 확인 실패:', error);
          // 에러 발생 시 빈 이미지로 간주하지 않고 계속 진행
          isEmpty = false;
        }
      }
      
      if (!isEmpty) {
        // 그림이 있는 경우에만 업로드 시도
        try {
          let jpgBlob;
          
          if (useSavedDrawing) {
            // 저장된 그림(DataURL)을 사용하여 이미지 생성
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = problemDrawing;
            });
            
            // 새로운 Canvas를 생성하여 흰색 배경을 포함한 이미지 생성
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            // 흰색 배경 먼저 그리기
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // 저장된 이미지 그리기
            tempCtx.drawImage(img, 0, 0);
            
            // Canvas를 JPG로 변환하여 Blob 생성
            jpgBlob = await new Promise((resolve, reject) => {
              tempCanvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Canvas 이미지를 JPG로 변환할 수 없습니다.'));
                  return;
                }
                resolve(blob);
              }, 'image/jpeg', 0.9); // JPG 품질 90%
            });
          } else {
            // 현재 Canvas를 사용
            // 새로운 Canvas를 생성하여 흰색 배경을 포함한 이미지 생성
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = drawingCanvas.width;
            tempCanvas.height = drawingCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            // 흰색 배경 먼저 그리기
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // 원본 Canvas 내용 그리기
            tempCtx.drawImage(drawingCanvas, 0, 0);
            
            // Canvas를 JPG로 변환하여 Blob 생성
            jpgBlob = await new Promise((resolve, reject) => {
              tempCanvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Canvas 이미지를 JPG로 변환할 수 없습니다.'));
                  return;
                }
                resolve(blob);
              }, 'image/jpeg', 0.9); // JPG 품질 90%
            });
          }
          
          // JPG Blob을 File 객체로 변환
          const drawingFile = new File([jpgBlob], `drawing_${Date.now()}.jpg`, { type: 'image/jpeg' });
          problemImageURL = await uploadImageToStorage(drawingFile);
          
          if (!problemImageURL) {
            throw new Error('이미지 업로드 실패: URL을 받지 못했습니다.');
          }
          
          problemData = { type: 'draw', imageURL: problemImageURL };
        } catch (error) {
          console.error('그림 업로드 실패:', error);
          if (!testMode) {
            alert('그림 업로드 중 오류가 발생했습니다: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = '제출하기';
            return;
          }
          // 테스트 모드에서는 업로드 실패해도 계속 진행
        }
      } else if (!testMode) {
        alert('문제를 그림으로 그려주세요.');
        return;
      }
      // 테스트 모드에서는 빈 그림이어도 제출 가능
    }
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = '제출 중...';

    // 현재 날짜와 시간
    // 날짜 설정 (테스트 모드에서는 선택한 날짜 사용)
    let submitDate;
    if (selectedDate && selectedDate.year && selectedDate.month && selectedDate.day) {
      try {
        // 선택한 날짜의 자정 시간으로 설정 (시간은 현재 시간 사용)
        submitDate = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.day);
        const now = new Date();
        submitDate.setHours(now.getHours());
        submitDate.setMinutes(now.getMinutes());
        submitDate.setSeconds(now.getSeconds());
        
        // 날짜 유효성 검사
        if (isNaN(submitDate.getTime())) {
          throw new Error('잘못된 날짜입니다.');
        }
        
        console.log('테스트 모드: 제출 날짜', submitDate);
      } catch (error) {
        console.error('날짜 설정 오류:', error);
        console.error('selectedDate:', selectedDate);
        // 날짜 설정 실패 시 현재 날짜 사용
        submitDate = new Date();
      }
    } else {
      submitDate = new Date();
    }
    const dateTime = formatDateTime(submitDate);
    
    // 날짜 형식 검증
    if (!dateTime.year || !dateTime.month || !dateTime.day) {
      throw new Error('날짜 형식이 올바르지 않습니다.');
    }

    // 대화 시간 계산
    const chatDuration = calculateChatDuration();

    // 사용자 정보 가져오기
    let userInfoData = null;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        userInfoData = userSnap.data();
      }
    } catch (error) {
      console.error('사용자 정보 조회 실패:', error);
    }

    // 공부시간 업데이트 (최종 확인)
    updateStudyTime();

    // Firestore에 저장할 데이터
    const data = {
      userName: userInfoData?.name || currentUser.displayName || '사용자',
      userEmail: currentUser.email,
      userStudentId: userInfoData?.studentId || null,
      chatDuration: chatDuration, // 초 단위
      emotion: selectedEmotionIcon, // 선택한 감정 이모티콘
      diaryContent: diaryContentTextarea.value.trim(),
      studyHours: studyHours, // 공부 시간 (시간)
      studyMinutes: studyMinutes, // 공부 시간 (분)
      problemType: problemType,
      problemData: problemData,
      problemExplanation: problemExplanationTextarea.value.trim(),
      chatHistory: chatHistory, // 전체 대화 내역
      activityDate: dateTime.date,
      activityTime: dateTime.time,
      activityYear: String(dateTime.year), // 문자열로 변환하여 일관성 유지
      activityMonth: String(dateTime.month).padStart(2, '0'), // 문자열로 변환하여 일관성 유지
      activityDay: String(dateTime.day).padStart(2, '0'), // 문자열로 변환하여 일관성 유지
      activityHours: String(dateTime.hours).padStart(2, '0'),
      activityMinutes: String(dateTime.minutes).padStart(2, '0'),
      timestamp: submitDate.toISOString(),
      userId: currentUser.uid
    };

    console.log('저장할 데이터:', data);

    // Firestore에 저장
    const docRef = await addDoc(collection(db, 'studentNotes'), data);
    console.log('문서 ID:', docRef.id);

    alert('제출되었습니다!');
    
    // 테스트 모드인지 확인하여 적절한 페이지로 이동
    const urlParams = new URLSearchParams(window.location.search);
    const isTestMode = urlParams.get('test') === 'student';
    const isModal = urlParams.get('modal') === 'true';
    
    if (isModal && isTestMode) {
      // 모달 모드: 부모 창에 메시지 전송하고 모달 닫기
      if (window.parent && window.parent !== window) {
        window.parent.postMessage('diary-submitted', '*');
      }
      // 모달이 닫히면 자동으로 페이지가 리로드되므로 여기서는 아무것도 하지 않음
    } else if (isTestMode) {
      // 테스트 모드: 학생 화면 테스트 페이지로 돌아가기
      window.location.href = 'index.html?test=student';
    } else {
      // 일반 모드: 홈으로 이동
      window.location.href = 'index.html';
    }
  } catch (error) {
    console.error('제출 실패:', error);
    console.error('에러 상세:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    alert(`제출 중 오류가 발생했습니다.\n\n에러: ${error.message || '알 수 없는 오류'}\n\n자세한 내용은 브라우저 콘솔을 확인해주세요.`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '제출하기';
  }
}

// DataURL을 Blob으로 변환
function dataURLToBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// 이벤트 리스너
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

endChatBtn.addEventListener('click', endChat);

// 탭 버튼 이벤트
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-btn')) {
    const tabName = e.target.dataset.tab;
    switchTab(tabName);
  }
});

// 이미지 업로드
if (problemImageInput) {
  problemImageInput.addEventListener('change', handleImageUpload);
}

// 그림 그리기 관련 버튼
document.addEventListener('click', (e) => {
  if (e.target.id === 'clear-canvas') {
    clearCanvas();
  }
  if (e.target.id === 'save-drawing') {
    saveDrawing();
  }
});

// 이모티콘 선택 이벤트
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('emotion-select-btn')) {
    selectEmotionIcon(e.target.dataset.emotion, e.target);
  }
});

// 공부시간 슬라이더 이벤트
const studyHoursSlider = document.getElementById('study-hours');
const studyMinutesSlider = document.getElementById('study-minutes');
const studyHoursValue = document.getElementById('study-hours-value');
const studyMinutesValue = document.getElementById('study-minutes-value');
const studyTimeTotal = document.getElementById('study-time-total');

function updateStudyTime() {
  if (studyHoursSlider && studyMinutesSlider) {
    studyHours = parseInt(studyHoursSlider.value) || 0;
    studyMinutes = parseInt(studyMinutesSlider.value) || 0;
    
    if (studyHoursValue) {
      studyHoursValue.textContent = studyHours;
    }
    if (studyMinutesValue) {
      studyMinutesValue.textContent = studyMinutes;
    }
    if (studyTimeTotal) {
      studyTimeTotal.textContent = `${studyHours}시간 ${studyMinutes}분`;
    }
  }
}

if (studyHoursSlider) {
  studyHoursSlider.addEventListener('input', updateStudyTime);
}
if (studyMinutesSlider) {
  studyMinutesSlider.addEventListener('input', updateStudyTime);
}

// 제출 버튼
if (submitBtn) {
  submitBtn.addEventListener('click', handleSubmit);
}
