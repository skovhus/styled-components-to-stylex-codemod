import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t.div`
  color: black;
  background-color: #f0f0f0;

  ${e=>e.$prominent?`
    font-weight: bold;
    font-size: 18px;

    @media (min-width: 768px) {
      font-size: 24px;
    }
  `:`
    font-weight: normal;
    font-size: 14px;

    @media (min-width: 768px) {
      font-size: 16px;
    }
  `}
`,i=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsx)(r,{$prominent:!1,children:`Default Banner`}),(0,n.jsx)(r,{$prominent:!0,children:`Prominent Banner`})]});export{i as App};