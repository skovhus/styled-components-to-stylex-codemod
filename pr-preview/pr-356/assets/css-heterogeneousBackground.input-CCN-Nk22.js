import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DRa1uduC.js";var n=e(),r=t.div`
  background: ${e=>e.$useGradient?`linear-gradient(90deg, red, blue)`:`green`};
`,i=t.div`
  background: ${e=>e.$color===`red`?`crimson`:e.$color===`blue`?`navy`:`gray`};
`,a=t.div`
  background: none;
  padding: 8px;
`,o=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{$useGradient:!1,children:`Solid Color`}),(0,n.jsx)(r,{$useGradient:!0,children:`Gradient`}),(0,n.jsx)(i,{$color:`red`,children:`Red`}),(0,n.jsx)(i,{$color:`blue`,children:`Blue`}),(0,n.jsx)(i,{$color:`default`,children:`Default`}),(0,n.jsx)(a,{children:`No Background`})]});export{o as App};