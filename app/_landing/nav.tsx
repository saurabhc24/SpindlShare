"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./landing.module.css";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={styles.nav} data-scrolled={scrolled || undefined}>
      <div className={styles.wrap}>
        <div className={styles.navInner}>
          <Link href="/" className={`${styles.wordmark} ${styles.navMark}`} aria-label="SpindlShare home">
            SpindlShare
          </Link>
          <nav className={styles.navActions} aria-label="Account">
            <Link href="/signup" className={`${styles.pill} ${styles.pillSmall}`}>
              Claim your link
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
