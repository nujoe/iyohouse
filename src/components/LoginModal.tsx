'use client'

import { useAuth } from '@/hooks/useAuth'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { signInWithGoogle, signInWithKakao } = useAuth()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm border border-zinc-800 bg-zinc-900 p-8 rounded-lg shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-white mb-2 tracking-tight uppercase">Login to IYO</h2>
        <p className="text-zinc-400 text-xs font-mono mb-8 uppercase tracking-wider">Join our creative ecosystem</p>

        <div className="space-y-3">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-3 px-4 rounded hover:bg-zinc-200 transition-colors uppercase text-sm tracking-widest"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
            Google Login
          </button>
          
          <button
            onClick={signInWithKakao}
            className="w-full flex items-center justify-center gap-3 bg-[#FEE500] text-[#3c1e1e] font-bold py-3 px-4 rounded hover:bg-[#FADA0A] transition-colors uppercase text-sm tracking-widest"
          >
            <div className="w-4 h-4 bg-current rounded-sm" style={{ maskImage: 'url(https://developers.kakao.com/assets/img/about/logos/kakaotalksharing/kakaotalk_sharing_btn_medium.png)', maskSize: 'contain' }} />
            Kakao Login
          </button>
        </div>

        <p className="mt-8 text-[10px] text-zinc-600 font-mono text-center uppercase tracking-tighter">
          By continuing, you agree to our terms and conditions.
        </p>
      </div>
    </div>
  )
}
