import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-DvP5zErB.js";n();var i=e(),a=r.img`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${e=>e.$disabled?t`
          filter: opacity(0.65);
        `:``}
  ${e=>e.$isInactive?t`
          box-shadow: 0 0 0 1px ${e.theme.color.bgSub};
          background-color: ${e.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `:``};
`,o=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`}),(0,i.jsx)(`br`,{}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0,$isInactive:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$isInactive:!0})]});export{o as App};