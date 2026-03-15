import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BFw42tS8.js";var n=e(),r=t.div`
  @keyframes zoomIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  animation-name: zoomIn;
  animation-duration: 0.3s;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
  background-color: lightsalmon;
  padding: 20px;
`,i=t.div`
  @keyframes slide-down {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  animation-name: slide-down;
  animation-duration: 0.4s;
  animation-timing-function: ease-in-out;
  background-color: lightsteelblue;
  padding: 20px;
`;function a(){return(0,n.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20},children:[(0,n.jsx)(r,{children:`Zoom In`}),(0,n.jsx)(i,{children:`Slide Down`})]})}export{a as App};