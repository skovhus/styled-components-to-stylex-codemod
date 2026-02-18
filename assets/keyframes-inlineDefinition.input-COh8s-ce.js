import{j as n,a}from"./index-CeQ9WA9b.js";const i=a.div`
  @keyframes fadeIn {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  animation: fadeIn 0.2s ease both;
  background: lightcoral;
  padding: 20px;
`,e=a.div`
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  animation: slideUp 0.3s ease-out;
  background: lightblue;
  padding: 20px;
`,t=a.div`
  @keyframes bounce-in {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  animation: bounce-in 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
  background: lightgreen;
  padding: 20px;
`;function s(){return n.jsxs("div",{style:{display:"flex",gap:16,padding:20},children:[n.jsx(i,{children:"Fading In"}),n.jsx(e,{children:"Sliding Up"}),n.jsx(t,{children:"Bouncing In"})]})}export{s as App};
