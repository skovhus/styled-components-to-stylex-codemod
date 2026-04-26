import"./chunk-jRWAZmH_.js";import{c as e,f as t,p as n,u as r}from"./index-BPaLyyRP.js";n();var i=t(),a=r.img`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${t=>t.$disabled?e`
          filter: opacity(0.65);
        `:``}
  ${t=>t.$isInactive?e`
          box-shadow: 0 0 0 1px ${t.theme.color.bgSub};
          background-color: ${t.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `:``};
`,o=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`}),(0,i.jsx)(`br`,{}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$disabled:!0,$isInactive:!0}),(0,i.jsx)(a,{src:`https://picsum.photos/200`,$isInactive:!0})]});export{o as App};