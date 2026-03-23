const fs = require('fs');
const path = require('path');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OUTPUT_DIR = 'output';
const CHUNK_SIZE = 10; // Telegram sendMediaGroup 최대 10장

// ─── Telegram sendMediaGroup 호출 ───────────────────────────────────────────
async function sendMediaGroup(chatId, pngFiles, caption) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`;

  const formData = new FormData();
  formData.append('chat_id', String(chatId));

  const media = [];
  for (let i = 0; i < pngFiles.length; i++) {
    const fieldName = `photo${i}`;
    const fileBuffer = fs.readFileSync(pngFiles[i]);
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append(fieldName, blob, path.basename(pngFiles[i]));

    const mediaItem = {
      type: 'photo',
      media: `attach://${fieldName}`,
    };
    if (i === 0 && caption) {
      mediaItem.caption = caption;
    }
    media.push(mediaItem);
  }

  formData.append('media', JSON.stringify(media));

  const response = await fetch(url, { method: 'POST', body: formData });
  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Telegram API 오류: ${JSON.stringify(result)}`);
  }
  return result;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('❌ TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 없습니다.');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log('output/ 폴더가 없습니다. 렌더링 결과가 없는 것 같습니다.');
    return;
  }

  // output/ 하위 디렉터리 목록 (콘텐츠별)
  const subdirs = fs.readdirSync(OUTPUT_DIR).filter((f) => {
    return fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory();
  });

  if (subdirs.length === 0) {
    console.log('전송할 콘텐츠가 없습니다.');
    return;
  }

  for (const subdir of subdirs) {
    const dirPath = path.join(OUTPUT_DIR, subdir);

    const pngFiles = fs
      .readdirSync(dirPath)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort()
      .map((f) => path.join(dirPath, f));

    if (pngFiles.length === 0) {
      console.log(`${subdir}: PNG 파일 없음, 건너뜀`);
      continue;
    }

    console.log(`📤 ${subdir} — ${pngFiles.length}장 전송 시작`);

    // 10장씩 청크로 나눠서 전송
    for (let i = 0; i < pngFiles.length; i += CHUNK_SIZE) {
      const chunk = pngFiles.slice(i, i + CHUNK_SIZE);
      const isFirst = i === 0;
      const caption = isFirst
        ? `📸 ${subdir}\n카드뉴스 ${pngFiles.length}장 생성 완료 ✅`
        : undefined;

      await sendMediaGroup(TELEGRAM_CHAT_ID, chunk, caption);
      console.log(`  청크 ${Math.floor(i / CHUNK_SIZE) + 1} 전송 완료`);

      // Telegram rate limit 방지 (청크 사이 1초 대기)
      if (i + CHUNK_SIZE < pngFiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ ${subdir} 전송 완료`);
  }

  console.log('🎉 모든 카드뉴스 전송 완료');
}

main().catch((err) => {
  console.error('오류 발생:', err.message);
  process.exit(1);
});
