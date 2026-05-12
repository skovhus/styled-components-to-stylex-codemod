import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BoZjbEnk.js";import{l as r}from"./helpers-BD83zaOO.js";import{t as i}from"./icon-DSLsOuWl.js";n();var a=e(),o=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,a.jsx)(`div`,{"data-focus-index":r,...i})},s=e=>{let{someAttribute:t,...n}=e;return(0,a.jsx)(`section`,{"data-some-attribute":t?`true`:`false`,...n})},c=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,l=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,u=t(o).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,d=t(s).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,f=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,p=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,m=t(o).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,h=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,g=t(o).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,_=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,v=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,y=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,b=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,x=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,S=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,C=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function w(e){let{className:t,height:n,style:r}=e;return(0,a.jsx)(S,{$height:n,className:t,style:r})}function T(e){let{children:t,className:n,size:r,style:i,variant:o}=e;return(0,a.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:i,children:t})}var E=t(t(T).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,D=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,O=`#7c3aed`,k=t.span.attrs(()=>({style:{color:O}}))`
  font-style: italic;
`,A=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,j=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(c,{$small:!0,placeholder:`Small`}),(0,a.jsx)(c,{placeholder:`Normal`}),(0,a.jsx)(c,{$padding:`2em`,placeholder:`Padded`}),(0,a.jsx)(l,{placeholder:`Text input`}),(0,a.jsx)(u,{loaded:!1,children:`Content`}),(0,a.jsx)(d,{children:`Section content`}),(0,a.jsx)(f,{children:`Scrollable content`}),(0,a.jsx)(p,{gutter:`stable`,children:`Type alias scrollable`}),(0,a.jsx)(m,{focusIndex:5,children:`Focus content`}),(0,a.jsx)(h,{children:`Box content`}),(0,a.jsx)(g,{children:`Aligned content`}),(0,a.jsx)(_,{children:`No wrapping text`}),(0,a.jsx)(v,{$height:50,children:`Dynamic height`}),(0,a.jsx)(y,{height:64,children:`Tile with attrs height`}),(0,a.jsx)(b,{children:`Optional height omitted`}),(0,a.jsx)(b,{height:24,children:`Optional height set`}),(0,a.jsx)(x,{children:`Mixed fallback height`}),(0,a.jsx)(w,{height:2,style:{opacity:1}}),(0,a.jsx)(C,{$height:4,children:`Fallback separator`}),(0,a.jsx)(E,{children:`Inherited attrs`}),(0,a.jsx)(D,{children:`Module scope style`}),(0,a.jsx)(k,{children:`Callback scope style`}),(0,a.jsx)(A,{title:`Attrs icon size`})]});export{g as AlignedFlex,j as App,u as Background,m as FocusableScroll,f as Scrollable,p as ScrollableWithType,d as Section,l as TextInput};