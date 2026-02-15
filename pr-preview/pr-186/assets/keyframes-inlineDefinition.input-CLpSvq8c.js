import{j as a,a as i}from"./index-XXtnx6TM.js";const n=i.div`
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
`,t=i.div`
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
`;function s(){return a.jsxs("div",{style:{display:"flex",gap:16,padding:20},children:[a.jsx(n,{children:"Fading In"}),a.jsx(t,{children:"Sliding Up"})]})}export{s as App};
