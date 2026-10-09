import { useId } from "react";
import styles from "./App.module.css";

export function MenuArtwork() {
  const prefix = useId();
  return <svg className={styles.menuArtwork} viewBox="0 0 640 550" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${prefix}-board`} x2="0" y2="1">
        <stop stopColor="#fff8e5" /><stop offset="1" stopColor="#deca9f" />
      </linearGradient>
      <symbol id={`${prefix}-house`} viewBox="0 0 140 150">
        <path d="M18 76 73 104 124 76v45l-51 29-55-28Z" fill="#edc4a0" />
        <path d="m73 104 51-28v45l-51 29Z" fill="#d38c70" />
        <path d="M10 78 48 25 132 76 73 109Z" fill="#41767a" />
        <path d="m48 25 26 59 58-8Z" fill="#30585e" />
        <path d="m34 94 17 9v17l-17-9Zm55 17 17-10v17l-17 10Z" fill="#365b61" />
        <path d="m58 119 12 6v22l-12-6Z" fill="#fff6dd" />
      </symbol>
      <symbol id={`${prefix}-tree`} viewBox="0 0 70 95">
        <ellipse cx="35" cy="85" rx="28" ry="9" fill="#476f54" opacity=".13" />
        <path d="M32 49h7v34h-7Z" fill="#a78658" />
        <path d="M35 5 58 18 66 41 54 64 30 71 9 52 5 28 17 10Z" fill="#7daa7b" />
        <path d="m35 5 4 35 15 24 12-23-8-23Z" fill="#56886b" />
      </symbol>
    </defs>
    <ellipse cx="320" cy="453" rx="261" ry="45" fill="#526e58" opacity=".12" />
    <path d="M45 287 320 133l276 154v55L320 500 45 344Z" fill="#c0a67d" />
    <path d="m45 287 275 156 276-156v27L320 472 45 315Z" fill="#e0c99d" />
    <path d="m45 287 275-154 276 154-276 157Z" fill={`url(#${prefix}-board)`} />
    <path d="m109 286 211-117 212 118-212 119Z" fill="#b9d09a" />
    <path d="m300 180 38 21-187 105-38-21Zm193 94 36 20-190 107-37-20Z" fill="#f4e8cb" />
    <g fill="#fff9e9" stroke="#d6c5a2" strokeWidth="2" strokeLinejoin="round">
      {[0, 1, 2, 3, 4].map(index => <g key={index}>
        <path d={`m${58 + index * 49} ${280 - index * 28} 41-23 40 23-41 24Z`} />
        <path d={`m${333 + index * 49} ${431 - index * 28} 41-23 40 23-41 24Z`} />
        <path d={`m${61 + index * 49} ${305 + index * 28} 40-23 41 23-41 24Z`} />
        <path d={`m${334 + index * 49} ${153 + index * 28} 40-23 41 23-41 24Z`} />
      </g>)}
    </g>
    <g strokeWidth="7" strokeLinecap="round">
      <path d="m88 272 21 12m77-68 21 12m270 151 21-12" stroke="#74b4b3" />
      <path d="m185 377 21-12m295-112 21 12" stroke="#daa26c" />
      <path d="m136 349 21-12m315-40 21-12" stroke="#a593be" />
    </g>
    <use href={`#${prefix}-house`} x="154" y="159" width="132" height="141" />
    <use href={`#${prefix}-house`} x="315" y="151" width="155" height="166" />
    <use href={`#${prefix}-house`} x="298" y="277" width="106" height="114" />
    <ellipse cx="259" cy="320" rx="38" ry="22" fill="#e5d3b0" />
    <ellipse cx="259" cy="311" rx="33" ry="18" fill="#fff9e8" />
    <ellipse cx="259" cy="311" rx="26" ry="13" fill="#79bec2" />
    <use href={`#${prefix}-tree`} x="112" y="236" width="51" height="70" />
    <use href={`#${prefix}-tree`} x="254" y="184" width="45" height="61" />
    <use href={`#${prefix}-tree`} x="435" y="283" width="49" height="67" />
    <g transform="translate(470 100) rotate(12)">
      <rect width="64" height="64" rx="13" fill="#d7c39c" />
      <rect x="-5" y="-6" width="64" height="64" rx="13" fill="#fff9e9" />
      <g fill="#315d64"><circle cx="12" cy="11" r="5" /><circle cx="42" cy="11" r="5" /><circle cx="12" cy="41" r="5" /><circle cx="42" cy="41" r="5" /></g>
    </g>
  </svg>;
}
