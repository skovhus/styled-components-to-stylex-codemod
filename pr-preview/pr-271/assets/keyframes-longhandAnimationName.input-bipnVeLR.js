import{j as n,c as o}from"./index-Dh_E0E_m.js";const i=o.div`
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
`,a=o.div`
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
`;function e(){return n.jsxs("div",{style:{display:"flex",gap:16,padding:20},children:[n.jsx(i,{children:"Zoom In"}),n.jsx(a,{children:"Slide Down"})]})}export{e as App};
