import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-BCTsKAj3.js";var r=e(),i=t`
  @keyframes PrimaryMove {
    to {
      transform: translateX(-18px);
    }
  }
`,a=t`
  @keyframes SecondaryMove {
    to {
      transform: translateX(-10px);
    }
  }
`,o=n.g`
  ${i}
  ${a}

  ${e=>e.isAnimated?t`
          animation:
            PrimaryMove 1s ease-out forwards,
            SecondaryMove 1.4s ease-in-out forwards;
          animation-delay: 0s, 1s;
        `:t`
          transform: translateX(-10px);
        `}
`;function s(){return(0,r.jsx)(`svg`,{children:(0,r.jsx)(o,{isAnimated:!0,children:(0,r.jsx)(`circle`,{cx:`24`,cy:`24`,r:`12`})})})}export{s as App};