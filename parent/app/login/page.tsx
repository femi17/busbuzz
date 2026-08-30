import styles from "./onboarding.module.css";
import InstallPrompt from "../components/InstallPrompt";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "BusBuzz — Sign in",
};

export default function LoginPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="390" height="300" fill="#1A1712" />
          <g stroke="#2a231d" strokeWidth="2" fill="none">
            <path d="M0 90 H390" />
            <path d="M0 200 H390" />
            <path d="M120 0 V300" />
            <path d="M290 0 V300" />
          </g>
          <path
            d="M-20 250 C 90 250, 90 120, 200 120 S 320 60, 410 60"
            fill="none"
            stroke="#F4B01A"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.9"
          />
          <circle cx="-20" cy="250" r="6" fill="#F4B01A" />
          <circle cx="410" cy="60" r="6" fill="#F4B01A" />
          <g transform="translate(200,120)">
            <circle r="26" fill="#F4B01A" opacity="0.2" />
            <g transform="translate(-16,-13)">
              <rect x="0" y="0" width="32" height="20" rx="4" fill="#F4B01A" />
              <rect x="4" y="4" width="8" height="7" rx="1.5" fill="#1A1712" />
              <rect x="15" y="4" width="8" height="7" rx="1.5" fill="#1A1712" />
              <rect x="25" y="4" width="4" height="7" rx="1" fill="#1A1712" />
              <circle cx="9" cy="21" r="3.4" fill="#1A1712" />
              <circle cx="23" cy="21" r="3.4" fill="#1A1712" />
            </g>
          </g>
        </svg>
        <div className={styles.cap}>
          <div className={styles.brand}>BUSBUZZ</div>
          <h1>
            Know exactly
            <br />
            where the <em>bus</em> is.
          </h1>
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.lead}>
          Track your child&apos;s school bus in real time — and get a ping the moment they board or
          reach their stop.
        </p>

        <LoginForm />

        <InstallPrompt />
      </div>
    </div>
  );
}
