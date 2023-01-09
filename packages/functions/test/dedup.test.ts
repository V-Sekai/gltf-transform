require('source-map-support').install();

import path from 'path';
import { createCanvas } from 'canvas';
import test from 'tape';
import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { dedup } from '../';
import { KHRMaterialsTransmission } from '@gltf-transform/extensions';

test('@gltf-transform/functions::dedup | accessors', async (t) => {
	const io = new NodeIO();
	const doc = await io.read(path.join(__dirname, 'in/many-cubes.gltf'));
	t.equal(doc.getRoot().listAccessors().length, 1503, 'begins with duplicate accessors');

	dedup({ propertyTypes: [PropertyType.TEXTURE] })(doc);

	t.equal(doc.getRoot().listAccessors().length, 1503, 'has no effect when disabled');

	dedup()(doc);

	t.equal(doc.getRoot().listAccessors().length, 3, 'prunes duplicate accessors');
	t.end();
});

test('@gltf-transform/functions::dedup | animation accessors', (t) => {
	const doc = new Document();
	const a = doc.createAccessor().setArray(new Float32Array([1, 2, 3]));
	const b = doc.createAccessor().setArray(new Float32Array([4, 5, 6]));
	const sampler1 = doc.createAnimationSampler().setInput(a).setOutput(b);
	const sampler2 = doc.createAnimationSampler().setInput(a.clone()).setOutput(b.clone());
	const sampler3 = doc.createAnimationSampler().setInput(a.clone()).setOutput(a.clone());
	const prim = doc.createPrimitive().setAttribute('POSITION', a.clone());
	doc.createMesh().addPrimitive(prim);
	doc.createAnimation().addSampler(sampler1).addSampler(sampler2).addSampler(sampler3);

	t.equal(doc.getRoot().listAccessors().length, 7, 'begins with duplicate accessors');

	dedup({ propertyTypes: [PropertyType.TEXTURE] })(doc);

	t.equal(doc.getRoot().listAccessors().length, 7, 'has no effect when disabled');

	dedup()(doc);

	t.equal(doc.getRoot().listAccessors().length, 4, 'prunes duplicate accessors');
	t.ok(sampler1.getInput() === a, 'sampler 1 input');
	t.ok(sampler1.getOutput() === b, 'sampler 1 output');
	t.ok(sampler2.getInput() === a, 'sampler 2 input');
	t.ok(sampler2.getOutput() === b, 'sampler 2 output');
	t.ok(sampler3.getInput() === a, 'sampler 3 input');
	t.ok(sampler3.getOutput() !== b, 'no mixing input/output');
	t.ok(sampler3.getOutput() !== b, 'no mixing input/output');
	t.ok(prim.getAttribute('POSITION') !== a, 'no mixing sampler/attribute');
	t.ok(prim.getAttribute('POSITION') !== b, 'no mixing sampler/attribute');
	t.end();
});

test('@gltf-transform/functions::dedup | materials', (t) => {
	const doc = new Document();
	const root = doc.getRoot();

	const mat = doc.createMaterial('MatA').setBaseColorHex(0xf2f2f2).setAlpha(0.9).setAlphaMode('OPAQUE');
	const matCloned = mat.clone();
	const matRenamed = mat.clone().setName('MatC');
	const matUnequal = mat.clone().setName('MatD').setAlphaMode('MASK');

	t.ok(mat.equals(matCloned), 'material.equals(material.clone())');

	dedup({ propertyTypes: [] })(doc);

	t.equals(root.listMaterials().length, 4, 'no-op when disabled');

	dedup()(doc);

	t.equal(root.listMaterials().length, 2, 'removes all duplicate materials');
	t.notOk(mat.isDisposed(), 'base = ✓');
	t.ok(matCloned.isDisposed(), 'cloned = ⨉');
	t.ok(matRenamed.isDisposed(), 'renamed = ⨉');
	t.notOk(matUnequal.isDisposed(), 'unequal = ✓');
	t.end();
});

test('@gltf-transform/functions::dedup | meshes', async (t) => {
	const io = new NodeIO();
	const doc = await io.read(path.join(__dirname, 'in/many-cubes.gltf'));
	const root = doc.getRoot();
	t.equal(root.listMeshes().length, 501, 'begins with duplicate meshes');

	dedup({ propertyTypes: [PropertyType.ACCESSOR] })(doc);

	t.equal(root.listMeshes().length, 501, 'has no effect when disabled');

	// Put unique materials on two meshes to prevent merging.
	root.listMeshes()[0].listPrimitives()[0].setMaterial(doc.createMaterial('A'));
	root.listMeshes()[1].listPrimitives()[0].setMaterial(doc.createMaterial('B'));
	root.listMeshes()[2].listPrimitives()[0].setMaterial(doc.createMaterial('C').setRoughnessFactor(0.5));

	dedup()(doc);

	t.equal(root.listMeshes().length, 3, 'prunes duplicate meshes');
	t.end();
});

test('@gltf-transform/functions::dedup | textures', (t) => {
	const doc = new Document();
	const transmissionExt = doc.createExtension(KHRMaterialsTransmission);

	const canvas = createCanvas(100, 50);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#222222';
	const image = canvas.toBuffer('image/png');

	const tex1 = doc.createTexture('copy 1').setMimeType('image/png').setImage(image);
	const tex2 = doc.createTexture('copy 2').setMimeType('image/png').setImage(image.slice());

	const transmission = transmissionExt.createTransmission().setTransmissionTexture(tex2);
	const mat = doc.createMaterial().setBaseColorTexture(tex1).setExtension('KHR_materials_transmission', transmission);

	t.equal(doc.getRoot().listTextures().length, 2, 'begins with duplicate textures');

	dedup({ propertyTypes: [PropertyType.ACCESSOR] })(doc);

	t.equal(doc.getRoot().listTextures().length, 2, 'has no effect when disabled');

	dedup()(doc);

	t.equal(doc.getRoot().listTextures().length, 1, 'prunes duplicate textures');
	t.equal(mat.getBaseColorTexture(), tex1, 'retains baseColorTexture');
	t.equal(transmission.getTransmissionTexture(), tex1, 'retains transmissionTexture');
	t.end();
});
