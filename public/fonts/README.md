# 폰트 파일 업로드 가이드

이 디렉토리에 커스텀 폰트 파일을 업로드하세요.

## 지원하는 폰트 파일 형식
- `.woff2` (권장 - 가장 작은 파일 크기)
- `.woff`
- `.ttf`
- `.otf`

## 폰트 파일 업로드 후 설정 방법

1. 폰트 파일을 이 디렉토리(`public/fonts/`)에 업로드하세요.

2. `src/styles.css` 파일을 열어서 상단의 `@font-face` 주석을 해제하고 수정하세요:

```css
@font-face {
  font-family: 'YourFontName';  /* 원하는 폰트 이름 */
  src: url('/fonts/YourFont-Regular.woff2') format('woff2'),
       url('/fonts/YourFont-Regular.woff') format('woff'),
       url('/fonts/YourFont-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'YourFontName';
  src: url('/fonts/YourFont-Bold.woff2') format('woff2'),
       url('/fonts/YourFont-Bold.woff') format('woff'),
       url('/fonts/YourFont-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

3. `:root` 스타일에서 `font-family`를 업데이트하세요:

```css
font-family: 'YourFontName', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

## 예시

폰트 파일 이름이 `NanumGothic-Regular.woff2`와 `NanumGothic-Bold.woff2`인 경우:

```css
@font-face {
  font-family: 'NanumGothic';
  src: url('/fonts/NanumGothic-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'NanumGothic';
  src: url('/fonts/NanumGothic-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

그리고 `:root`에서:
```css
font-family: 'NanumGothic', 'Noto Sans KR', sans-serif;
```

## 참고사항
- 폰트 파일 이름에 공백이 있으면 URL 인코딩이 필요할 수 있습니다.
- 여러 폰트 파일 형식을 제공하면 브라우저가 지원하는 형식을 자동으로 선택합니다.
- `font-display: swap`은 폰트 로딩 중에도 텍스트를 표시하도록 합니다.

