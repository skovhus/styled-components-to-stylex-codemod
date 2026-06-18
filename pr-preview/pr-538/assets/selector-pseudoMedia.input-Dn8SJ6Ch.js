import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{c as t,u as n}from"./index-DvP5zErB.js";var r=e(),i=t`
  100% {
    transform: translateX(100%);
  }
`,a=n.div`
  color: blue;
  background-color: white;

  &:hover {
    color: red;
    background-color: lightblue;
  }

  &:focus-visible {
    color: green;
    outline: 2px solid blue;
  }

  @media (max-width: 600px) {
    color: orange;
    background-color: gray;
  }
`,o=n.div`
  position: relative;
  overflow: hidden;
  height: 20px;
  background-color: #e2e8f0;
  border-radius: 4px;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(90deg, transparent, #f8fafc, transparent);
    animation: ${i} 3s infinite;
    animation-play-state: paused;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,r.jsx)(a,{children:`Hover or focus me, and resize!`}),(0,r.jsx)(o,{})]});export{s as App};