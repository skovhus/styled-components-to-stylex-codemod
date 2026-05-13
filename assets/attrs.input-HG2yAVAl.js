import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-CZ91Qxx2.js";import{l as r}from"./helpers-C_mLkWOI.js";import{t as i}from"./icon-kzqTjrFv.js";n();var a=e(),o=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,a.jsx)(`div`,{"data-focus-index":r,...i})},s=e=>{let{focusIndex:t,otherAttribute:n,someAttribute:r,...i}=e;return(0,a.jsx)(`section`,{"data-focus-index":t,"data-other-attribute":n?`true`:`false`,"data-some-attribute":r?`true`:`false`,...i})},c=()=>void 0,l=t.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,u=t(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,d=t(o).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,f=t(s).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,p=t(s).attrs({someAttribute:!0})`
  padding: 12px;
  background-color: #ecfdf5;
`,m=t(s).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#1d4ed8`:`#64748b`};
`,h=t(s).attrs({someAttribute:!0})`
  padding: 10px;
  background-color: ${e=>e.tone===`success`?`#dcfce7`:`#dbeafe`};
`,g=t(s).attrs({someAttribute:!0})`
  padding: 14px;
  background-color: #fef3c7;
`,_=t(s)`
  color: ${e=>e.tone===`secondary`?`#7c2d12`:`#1e3a8a`};
`,v=t(s).attrs({someAttribute:!0})`
  padding: 6px;
  background-color: #fdf2f8;
`,y=t(s).attrs(e=>({tabIndex:e.focusIndex}))`
  color: #334155;
`,b=t(s).attrs({someAttribute:!0})`
  padding: 18px;
  background-color: #eef2ff;
`,x=t(s).attrs({otherAttribute:!0,someAttribute:!0})`
  padding: 20px;
  background-color: #f0fdf4;
`,S=t(s).attrs({someAttribute:!0})`
  padding: 22px;
  background-color: #fff7ed;
`,C=t(s).attrs({someAttribute:!0})`
  padding: 24px;
  background-color: #f8fafc;
`,w=t(s).attrs({someAttribute:!0})`
  padding: 25px;
  background-color: #f1f5f9;
`,T=t(s)`
  color: ${e=>e.$tone===`warm`?`#9f1239`:`#1d4ed8`};
`,E=t(s).attrs({onClick:c})`
  padding: 26px;
  background-color: #eff6ff;
`,D=t(s).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#0f766e`:`#475569`};
`,O=t(s)`
  background-color: ${e=>e.$active?`#ccfbf1`:`#f8fafc`};
`,k=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,A=t(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,j=t(o).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,M=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,N=t(o).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,P=t.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,F=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,I=t.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,L=t.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,R=t.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,z=t.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,B=t.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function V(e){let{className:t,height:n,style:r}=e;return(0,a.jsx)(z,{$height:n,className:t,style:r})}function H(e){let{children:t,className:n,size:r,style:i,variant:o}=e;return(0,a.jsx)(`button`,{className:n,"data-size":r,"data-variant":o,style:i,children:t})}var U=t(t(H).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,W=t.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,G=`#7c3aed`,K=t.span.attrs(()=>({style:{color:G}}))`
  font-style: italic;
`,q=t(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,J=()=>(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(l,{$small:!0,placeholder:`Small`}),(0,a.jsx)(l,{placeholder:`Normal`}),(0,a.jsx)(l,{$padding:`2em`,placeholder:`Padded`}),(0,a.jsx)(u,{placeholder:`Text input`}),(0,a.jsx)(d,{loaded:!1,children:`Content`}),(0,a.jsx)(f,{label:`section-label`,children:`Section content`}),(0,a.jsx)(p,{label:`imported-section-label`,children:`Imported section content`}),(0,a.jsx)(m,{$active:!0,children:`Highlighted section content`}),(0,a.jsx)(h,{tone:`success`,children:`Utility section content`}),(0,a.jsx)(g,{tone:`primary`,children:`Shared attrs section content`}),(0,a.jsx)(_,{someAttribute:!1,tone:`secondary`,children:`Shared plain section content`}),(0,a.jsx)(v,{localLabel:`local-label`,children:`Imported intersection section content`}),(0,a.jsx)(y,{focusIndex:2,children:`Focus index section content`}),(0,a.jsx)(b,{label:`pick-label`,children:`Pick section content`}),(0,a.jsx)(x,{label:`multi-label`,children:`Multi imported section content`}),(0,a.jsx)(S,{localLabel:`inherited-label`,children:`Inherited section content`}),(0,a.jsx)(C,{kind:`alpha`,onlyAlpha:1,children:`Union section content`}),(0,a.jsx)(w,{kind:`beta`,onlyBeta:`utility`,children:`Utility wrapped union section content`}),(0,a.jsx)(T,{detail:`branch`,kind:`alpha`,$tone:`warm`,children:`Transient union section content`}),(0,a.jsx)(E,{label:`method-label`,children:`Method section content`}),(0,a.jsx)(D,{$active:!0,label:`shared-transient-attrs`,children:`Shared transient attrs section content`}),(0,a.jsx)(O,{$active:!0,label:`shared-transient-plain`,children:`Shared transient plain section content`}),(0,a.jsx)(k,{children:`Scrollable content`}),(0,a.jsx)(A,{gutter:`stable`,children:`Type alias scrollable`}),(0,a.jsx)(j,{focusIndex:5,children:`Focus content`}),(0,a.jsx)(M,{children:`Box content`}),(0,a.jsx)(N,{children:`Aligned content`}),(0,a.jsx)(P,{children:`No wrapping text`}),(0,a.jsx)(F,{$height:50,children:`Dynamic height`}),(0,a.jsx)(I,{height:64,children:`Tile with attrs height`}),(0,a.jsx)(L,{children:`Optional height omitted`}),(0,a.jsx)(L,{height:24,children:`Optional height set`}),(0,a.jsx)(R,{children:`Mixed fallback height`}),(0,a.jsx)(V,{height:2,style:{opacity:1}}),(0,a.jsx)(B,{$height:4,children:`Fallback separator`}),(0,a.jsx)(U,{children:`Inherited attrs`}),(0,a.jsx)(W,{children:`Module scope style`}),(0,a.jsx)(K,{children:`Callback scope style`}),(0,a.jsx)(q,{title:`Attrs icon size`})]});export{N as AlignedFlex,J as App,d as Background,y as FocusIndexSection,j as FocusableScroll,m as HighlightSection,v as ImportedIntersectionSection,p as ImportedSection,S as InheritedSection,E as MethodSection,x as MultiImportedSection,b as PickSection,k as Scrollable,A as ScrollableWithType,f as Section,g as SharedAttrsSection,_ as SharedPlainSection,D as SharedTransientAttrsSection,O as SharedTransientPlainSection,u as TextInput,T as TransientUnionSection,C as UnionSection,h as UtilitySection,w as UtilityWrappedUnionSection};