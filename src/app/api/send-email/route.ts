import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, subject, message } = await request.json();

    const data = await resend.emails.send({
      from: 'IYOHOUSE Contact <onboarding@resend.dev>',
      to: ['goyangiyoram@gmail.com'], // 여기에 메일을 받으실 주소를 적으세요.
      subject: `[IYOHOUSE 문의] ${subject}`,
      html: `
        <h2>새로운 문의가 도착했습니다.</h2>
        <p><strong>보낸 사람:</strong> ${email}</p>
        <p><strong>제목:</strong> ${subject}</p>
        <p><strong>내용:</strong></p>
        <div style="padding: 15px; background: #f5f5f5; border-radius: 5px;">
          ${message.replace(/\n/g, '<br/>')}
        </div>
      `,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
