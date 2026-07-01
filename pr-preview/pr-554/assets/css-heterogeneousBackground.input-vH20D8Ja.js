import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DJEzJNq1.js";var n=e(),r=t.div`
  background: ${e=>e.$useGradient?`linear-gradient(90deg, red, blue)`:`green`};
`,i=t.div`
  background: ${e=>e.$color===`red`?`crimson`:e.$color===`blue`?`navy`:`gray`};
`,a=t.div`
  background: none;
  padding: 8px;
`,o=t.button`
  background: pink;
  padding: 8px;

  &:hover {
    background: none;
  }
`,s=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{$useGradient:!1,children:`Solid Color`}),(0,n.jsx)(r,{$useGradient:!0,children:`Gradient`}),(0,n.jsx)(i,{$color:`red`,children:`Red`}),(0,n.jsx)(i,{$color:`blue`,children:`Blue`}),(0,n.jsx)(i,{$color:`default`,children:`Default`}),(0,n.jsx)(a,{children:`No Background`}),(0,n.jsx)(o,{children:`Hover Reset`})]});export{s as App};