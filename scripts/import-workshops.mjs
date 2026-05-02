
import { createClient } from '@sanity/client';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// .env.local에서 환경 변수 로드
dotenv.config({ path: '.env.local' });

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_WRITE_TOKEN, // 쓰기 권한이 있는 토큰이 필요합니다.
});

async function migrate() {
  console.log('🚀 Starting migration to Sanity...');

  const assetsDir = path.join(process.cwd(), 'public/assets');
  const publicDir = path.join(process.cwd(), 'public');

  // 1부터 24까지 반복
  for (let i = 1; i <= 24; i++) {
    const numStr = i.toString().padStart(2, '0');
    let imagePath = path.join(assetsDir, `${numStr}.png`);
    if (!fs.existsSync(imagePath)) {
      imagePath = path.join(assetsDir, `${numStr}.jpg`);
    }
    if (!fs.existsSync(imagePath) && i === 24) {
      imagePath = path.join(assetsDir, `24.jpg`);
    }

    console.log(`\n📦 Processing Workshop #${i}...`);

    // 1. 이미지 업로드
    let asset;
    if (fs.existsSync(imagePath)) {
      const imageData = fs.readFileSync(imagePath);
      asset = await client.assets.upload('image', imageData, {
        filename: path.basename(imagePath),
      });
      console.log(`✅ Image uploaded: ${path.basename(imagePath)}`);
    } else {
      console.log(`⚠️ Image not found: ${imagePath}`);
    }

    // 2. 텍스트 정보 구성 (기본값)
    const title = `AI.zip ${i} 그래픽`;
    const description = [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'Ai.zip은 생성형 AI의 사용법을 배우고 다양한 직업에 접목해 보는 워크숍 시리즈입니다.' }],
        markDefs: [],
        style: 'normal',
      }
    ];

    // 3. 문서 생성 또는 업데이트
    const doc = {
      _type: 'workshop',
      _id: `workshop-${i}`,
      number: i,
      title: title,
      slug: { _type: 'slug', current: `workshop-${i}` },
      description: description,
      isClosed: i <= 11, // 11번까지는 마감 처리 (기존 로직 유지)
      price: 150000,
      tutor: '현',
      tags: ['AI', 'WORKSHOP', 'GRAPHIC'],
    };

    if (asset) {
      doc.poster = {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: asset._id,
        },
      };
    }

    await client.createOrReplace(doc);
    console.log(`✨ Workshop #${i} created/updated in Sanity.`);
  }

  console.log('\n🎉 Migration completed successfully!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
