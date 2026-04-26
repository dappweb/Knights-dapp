import{j as e,q as x}from"./vendor-react-e55f24f0.js";const g=({children:t,onClick:o,disabled:l=!1,loading:s=!1,variant:r="primary",size:i="md",className:d="",icon:a,fullWidth:n=!1})=>{const m=`
    relative overflow-hidden font-bold rounded-xl transition-all duration-200 
    transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
    flex items-center justify-center gap-2
  `,h={primary:"bg-gradient-to-r from-amber-400 to-amber-700 hover:from-amber-300 hover:to-amber-600 text-[#070B10] shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40",secondary:"bg-[#101820] hover:bg-[#16212B] text-white border border-amber-500/20 shadow-lg hover:shadow-xl",success:"bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/40",warning:"bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/40",danger:"bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-lg shadow-rose-500/40"},b={sm:"px-3 py-2 text-sm",md:"px-4 py-3 text-base",lg:"px-6 py-4 text-lg"},c=n?"w-full":"";return e.jsxs("button",{onClick:o,disabled:l||s,className:`
        ${m}
        ${h[r]}
        ${b[i]}
        ${c}
        ${d}
      `,children:[r==="primary"&&e.jsx("div",{className:"absolute inset-0 bg-white/20 translate-x-[-100%] animate-[shimmer_2s_infinite]"}),r==="secondary"&&e.jsx("div",{className:"absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"}),e.jsx("div",{className:"absolute inset-0 overflow-hidden rounded-xl",children:e.jsx("div",{className:"absolute inset-0 bg-white/10 scale-0 rounded-full transition-transform duration-300 group-active:scale-150"})}),e.jsxs("div",{className:"relative flex items-center justify-center gap-2",children:[s&&e.jsx(x,{className:"animate-spin",size:20}),!s&&a&&a,e.jsx("span",{children:t})]})]})};export{g as A};
