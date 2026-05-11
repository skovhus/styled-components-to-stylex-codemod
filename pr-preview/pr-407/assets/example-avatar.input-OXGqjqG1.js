import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n,p as r}from"./index-XMJn79Jf.js";r();var i=e(),a=t.img`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${e=>e.$disabled?n`
          filter: opacity(0.65);
        `:``}
  ${e=>e.$isInactive?n`
          box-shadow: 0 0 0 1px ${e.theme.color.bgSub};
          background-color: ${e.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `:``};
`,o=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`}),(0,i.jsx)(`br`,{}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0,$isInactive:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$isInactive:!0})]});export{o as App};