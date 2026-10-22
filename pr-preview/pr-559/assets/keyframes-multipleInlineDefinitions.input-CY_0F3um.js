import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";var r=e(),i=n`
  @keyframes PrimaryMove {
    to {
      transform: translateX(-18px);
    }
  }
`,a=n`
  @keyframes SecondaryMove {
    to {
      transform: translateX(-10px);
    }
  }
`,o=t.g`
  ${i}
  ${a}

  ${e=>e.isAnimated?n`
          animation:
            PrimaryMove 1s ease-out forwards,
            SecondaryMove 1.4s ease-in-out forwards;
          animation-delay: 0s, 1s;
        `:n`
          transform: translateX(-10px);
        `}
`;function s(){return(0,r.jsx)(`svg`,{children:(0,r.jsx)(o,{isAnimated:!0,children:(0,r.jsx)(`circle`,{cx:`24`,cy:`24`,r:`12`})})})}export{s as App};