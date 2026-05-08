<template>
  <div class="slidev-layout two-col w-full h-full">
    <div class="col-header"><slot /></div>
    <div class="col-left"><slot name="left" /></div>
    <div class="col-right"><slot name="right" /></div>
  </div>
</template>
