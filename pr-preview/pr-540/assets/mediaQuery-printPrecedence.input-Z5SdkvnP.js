import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-CWv6t7He.js";var n=e(),r=t.div`
  display: flex;
  overflow: auto;
  align-items: center;
  justify-content: center;
  min-height: 80px;

  @media print {
    display: block;
    overflow: visible;
  }
`,i=t.div`
  opacity: ${e=>+!e.$isLoading};
  pointer-events: ${e=>e.$isLoading?`none`:`auto`};
  transition: opacity ${e=>e.$isLoading?100:0}ms
    ${e=>e.$isLoading?500:0}ms ease-in;
  display: flex;
  flex-direction: column;
  overflow: auto;
  scrollbar-gutter: ${e=>e.$gutter};
  ${e=>e.$overflow?`overflow: ${e.$overflow};`:``}
  ${e=>e.$isLoading?`
        will-change: opacity;
        backface-visibility: hidden;
      `:``}

  @media print {
    display: block;
    overflow: visible;
    height: auto;
    min-height: 0;
    opacity: 1;
    pointer-events: auto;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,n.jsx)(r,{children:`Loading`}),(0,n.jsx)(i,{$gutter:`stable`,$isLoading:!0,$overflow:`hidden`,children:`Fading`}),(0,n.jsx)(i,{children:`Idle`})]});export{a as App};