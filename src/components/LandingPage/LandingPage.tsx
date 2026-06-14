import { useEffect, useRef, useState } from 'react'
import './LandingPage.css'

const SPOTLIGHT_RADIUS = 185
const XRAY_IMAGE = '/xray-renaissance-hands.png'
const SKIN_IMAGE = '/skin-renaissance-hands.png'

interface RevealLayerProps {
  image: string
  cursorX: number
  cursorY: number
}

const featureCards = [
  {
    title: 'Windowing and Leveling',
    text: 'Adjust brightness and contrast for CT, MRI, CR, DX and other medical imaging studies directly in the viewer.',
  },
  {
    title: 'MPR Review',
    text: 'Inspect volumetric studies with axial, sagittal and coronal review workflows when the series supports it.',
  },
  {
    title: 'Zoom, Pan and Stack Navigation',
    text: 'Move through slices, zoom into details and pan across large images with a focused radiology-style interface.',
  },
]

const faqs = [
  {
    question: 'What is an online DICOM viewer?',
    answer:
      'An online DICOM viewer lets you open DICOM and DCM medical imaging files in a web browser instead of installing a desktop radiology viewer.',
  },
  {
    question: 'Are my DICOM files uploaded?',
    answer:
      'Online DICOM is designed for client-side processing. Studies are opened in your browser session without server upload or storage.',
  },
  {
    question: 'Can I open DICOM files on Mac or Windows?',
    answer:
      'Yes. Launch the viewer from a modern browser, select your DICOM or DCM files and review the study without installing native desktop software.',
  },
  {
    question: 'Which modalities are supported?',
    answer:
      'Online DICOM is built for common DICOM workflows including CT, MRI, X-ray, CR, DX and ultrasound. Support can vary by file structure, transfer syntax and browser capability.',
  },
  {
    question: 'Can I use this viewer for diagnosis?',
    answer:
      'Online DICOM is intended for quick viewing, education and convenient review. It is not a certified medical device and should not replace diagnostic workstations or professional medical judgment.',
  },
]

function RevealLayer({ image, cursorX, cursorY }: RevealLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [maskUrl, setMaskUrl] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    if (!canvas || !ctx) {
      return
    }

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (cursorX !== -999 && cursorY !== -999) {
      const gradient = ctx.createRadialGradient(
        cursorX,
        cursorY,
        0,
        cursorX,
        cursorY,
        SPOTLIGHT_RADIUS,
      )

      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.32, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.58, 'rgba(255,255,255,0.78)')
      gradient.addColorStop(0.76, 'rgba(255,255,255,0.36)')
      gradient.addColorStop(0.9, 'rgba(255,255,255,0.1)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cursorX, cursorY, SPOTLIGHT_RADIUS, 0, Math.PI * 2)
      ctx.fill()
    }

    setMaskUrl(canvas.toDataURL())
  }, [cursorX, cursorY])

  return (
    <>
      <canvas ref={canvasRef} className="reveal-canvas" aria-hidden="true" />
      <div
        className="visual-layer reveal-layer"
        style={{
          backgroundImage: `url(${image})`,
          maskImage: maskUrl ? `url(${maskUrl})` : 'none',
          WebkitMaskImage: maskUrl ? `url(${maskUrl})` : 'none',
        }}
        aria-hidden="true"
      />
    </>
  )
}

function LandingPage() {
  const [cursorPos, setCursorPos] = useState({ x: -999, y: -999 })
  const [skinProgress, setSkinProgress] = useState(0)
  const mouse = useRef({ x: -999, y: -999 })
  const smooth = useRef({ x: -999, y: -999 })
  const rafRef = useRef<number>()

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY }

      if (smooth.current.x === -999) {
        smooth.current = { x: event.clientX, y: event.clientY }
      }
    }

    const handlePointerLeave = () => {
      mouse.current = { x: -999, y: -999 }
      smooth.current = { x: -999, y: -999 }
      setCursorPos({ x: -999, y: -999 })
    }

    const updateCursor = () => {
      if (smooth.current.x !== -999) {
        smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1
        smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1
        setCursorPos({ x: smooth.current.x, y: smooth.current.y })
      }

      rafRef.current = requestAnimationFrame(updateCursor)
    }

    window.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerleave', handlePointerLeave)
    rafRef.current = requestAnimationFrame(updateCursor)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerleave', handlePointerLeave)

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const updateSkinProgress = () => {
      const scrollRange = window.innerHeight * 0.75
      const nextProgress = Math.min(Math.max(window.scrollY / scrollRange, 0), 1)
      setSkinProgress(nextProgress)
    }

    updateSkinProgress()
    window.addEventListener('scroll', updateSkinProgress, { passive: true })
    window.addEventListener('resize', updateSkinProgress)

    return () => {
      window.removeEventListener('scroll', updateSkinProgress)
      window.removeEventListener('resize', updateSkinProgress)
    }
  }, [])

  const hasCursor = cursorPos.x !== -999 && cursorPos.y !== -999

  return (
    <div className="lithos-landing">
      <nav className="lithos-nav" aria-label="Primary navigation">
        <a href="/" className="lithos-brand" aria-label="onlinedicom home">
          <svg width="26" height="26" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" />
          </svg>
          <span>onlinedicom</span>
        </a>

        <p className="nav-center">Browser-based medical image viewer</p>

        <a href="/app" className="nav-launch">
          Launch App
        </a>
      </nav>

      <div className="fixed-visual-field" aria-hidden="true">
        <div className="visual-layer xray-base" style={{ backgroundImage: `url(${XRAY_IMAGE})` }} />
        <div className="visual-overlay" />
        <div
          className="visual-layer skin-scroll-layer"
          style={{
            backgroundImage: `url(${SKIN_IMAGE})`,
            opacity: skinProgress * 0.68,
            filter: `brightness(${0.82 + skinProgress * 0.22}) contrast(${
              1.02 + skinProgress * 0.12
            }) saturate(${0.74 + skinProgress * 0.42})`,
          }}
        />
        <RevealLayer image={SKIN_IMAGE} cursorX={cursorPos.x} cursorY={cursorPos.y} />

        {hasCursor && (
          <div
            className="cursor-aura"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: SPOTLIGHT_RADIUS * 2,
              height: SPOTLIGHT_RADIUS * 2,
            }}
          />
        )}
      </div>

      <main className="lithos-content">
        <section className="hero-panel">
          <div className="hero-motto" aria-hidden="true">
            Veritas per umbras
          </div>

          <div className="hero-copy-block">
            <h1>
              <span>Online DICOM Viewer</span>
            </h1>
            <a href="/app" className="hero-cta">
              Launch App
            </a>
            <h2>
              Open CT, MRI, X-ray and other DICOM studies in your browser with no login, no
              upload and no desktop installation.
            </h2>
          </div>

          <p className="hero-privacy-note">
            Your DICOM files stay on your device. Studies are opened client-side in your browser,
            without server upload or storage. <a href="#privacy">Read privacy details.</a>
          </p>

          <dl className="hero-keywords">
            <div>
              <dt>Formats</dt>
              <dd>DICOM, DCM</dd>
            </div>
            <div>
              <dt>Modalities</dt>
              <dd>CT, MRI, X-ray</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>No login</dd>
            </div>
          </dl>
        </section>

        <section className="dark-section two-column-section" id="privacy">
          <div>
            <p className="section-kicker">Privacy-first by design</p>
            <h2>Browser-Based DICOM Viewing</h2>
          </div>
          <div className="section-copy">
            <p>
              Medical images can contain protected health information. Online DICOM opens and
              renders studies client-side in your browser, so files are not uploaded, stored,
              indexed or shared by our servers.
            </p>
            <p>
              This local-processing architecture supports privacy-conscious HIPAA and KVKK
              workflows. Final compliance depends on your organization, policies, consent model and
              clinical use case.
            </p>
          </div>
        </section>

        <section className="dark-section bordered-section" id="features">
          <div className="section-inner">
            <p className="section-kicker">Clinical viewing tools</p>
            <h2>Open medical imaging files online</h2>
            <div className="feature-row">
              {featureCards.map((feature) => (
                <article key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="dark-section" id="how-it-works">
          <div className="section-inner">
            <p className="section-kicker">How it works</p>
            <h2>Drag, drop and start reviewing</h2>
            <div className="steps-row">
              <article>
                <p>01</p>
                <h3>No login required</h3>
                <span>Open the free online DICOM viewer directly from your browser.</span>
              </article>
              <article>
                <p>02</p>
                <h3>No server upload</h3>
                <span>Select DICOM or DCM studies from your device for local browser rendering.</span>
              </article>
              <article>
                <p>03</p>
                <h3>No installation</h3>
                <span>Inspect medical images while keeping patient data under your local control.</span>
              </article>
            </div>
          </div>
        </section>

        <section className="dark-section bordered-section" id="faq">
          <div className="faq-inner">
            <p className="section-kicker">FAQ</p>
            <h2>Online DICOM Viewer FAQ</h2>
            <div className="faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    <span>{faq.question}</span>
                    <span className="summary-arrow">&gt;</span>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="lithos-footer">
        <div>
          <strong>onlinedicom</strong>
          <p>
            Online DICOM is not a certified medical device and must not be used as the sole basis
            for diagnosis, treatment decisions or emergency care.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/app">Open Viewer</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="mailto:hello@onlinedicom.com">Contact</a>
        </nav>
      </footer>
    </div>
  )
}

export default LandingPage
