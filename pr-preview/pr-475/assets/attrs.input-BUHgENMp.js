import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-Ccp5BidM.js";import{l as r}from"./helpers-DodXqIuH.js";import{t as i}from"./icon-C-9NqC-y.js";n();var a=e(),o=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,a.jsx)(`div`,{"data-focus-index":r,...i})},s=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,c=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,l=t(o).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,u=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,d=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,f=t(o).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,p=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,m=t(o).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,h=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,g=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,_=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,v=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,y=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,b=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,x=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function S(e){let{className:t,height:n,style:r}=e;return(0,a.jsx)(b,{$height:n,className:t,style:r})}function C(e){let{children:t,className:n,size:r,style:i,variant:o}=e;return(0,a.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:i,children:t})}var w=t(t(C).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,T=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,E=`#7c3aed`,D=t.span.attrs(()=>({style:{color:E}}))`
  font-style: italic;
`,O=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,k=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(s,{$small:!0,placeholder:`Small`}),(0,a.jsx)(s,{placeholder:`Normal`}),(0,a.jsx)(s,{$padding:`2em`,placeholder:`Padded`}),(0,a.jsx)(c,{placeholder:`Text input`}),(0,a.jsx)(l,{loaded:!1,children:`Content`}),(0,a.jsx)(u,{children:`Scrollable content`}),(0,a.jsx)(d,{gutter:`stable`,children:`Type alias scrollable`}),(0,a.jsx)(f,{focusIndex:5,children:`Focus content`}),(0,a.jsx)(p,{children:`Box content`}),(0,a.jsx)(m,{children:`Aligned content`}),(0,a.jsx)(h,{children:`No wrapping text`}),(0,a.jsx)(g,{$height:50,children:`Dynamic height`}),(0,a.jsx)(_,{height:64,children:`Tile with attrs height`}),(0,a.jsx)(v,{children:`Optional height omitted`}),(0,a.jsx)(v,{height:24,children:`Optional height set`}),(0,a.jsx)(y,{children:`Mixed fallback height`}),(0,a.jsx)(S,{height:2,style:{opacity:1}}),(0,a.jsx)(x,{$height:4,children:`Fallback separator`}),(0,a.jsx)(w,{children:`Inherited attrs`}),(0,a.jsx)(T,{children:`Module scope style`}),(0,a.jsx)(D,{children:`Callback scope style`}),(0,a.jsx)(O,{title:`Attrs icon size`})]});export{m as AlignedFlex,k as App,l as Background,f as FocusableScroll,u as Scrollable,d as ScrollableWithType,c as TextInput};