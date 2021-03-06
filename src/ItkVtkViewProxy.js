import macro from 'vtk.js/Sources/macro';

import vtkViewProxy from 'vtk.js/Sources/Proxy/Core/ViewProxy';
import vtkCellPicker from 'vtk.js/Sources/Rendering/Core/CellPicker';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkCubeSource from 'vtk.js/Sources/Filters/Sources/CubeSource';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';

const { vtkErrorMacro } = macro;

// ----------------------------------------------------------------------------
// ItkVtkViewProxy methods
// ----------------------------------------------------------------------------

function ItkVtkViewProxy(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('ItkVtkViewProxy');

  // Private --------------------------------------------------------------------
  //
  function setVisualizationMode(axisIndex) {
    // volume rendering
    if (axisIndex === -1) {
      model.interactor.setInteractorStyle(model.interactorStyle3D);
      if (model.volumeRenderingCameraState) {
        model.camera.setFocalPoint(
          ...model.volumeRenderingCameraState.focalPoint
        );
        model.camera.setPosition(...model.volumeRenderingCameraState.position);
        model.camera.setViewUp(...model.volumeRenderingCameraState.viewUp);
        model.camera.setViewAngle(model.volumeRenderingCameraState.viewAngle);
        model.camera.setParallelScale(
          model.volumeRenderingCameraState.parallelScale
        );
        model.camera.setPhysicalTranslation(
          ...model.volumeRenderingCameraState.physicalTranslation
        );
      }
      model.camera.setParallelProjection(false);
      if (model.volumeRepresentation) {
        model.volumeRepresentation.setSliceVisibility(model.viewPlanes);
        model.volumeRepresentation.setVolumeVisibility(true);
      }
    } else {
      model.camera.setParallelProjection(true);
      model.interactor.setInteractorStyle(model.interactorStyle2D);
      if (model.volumeRepresentation) {
        model.volumeRepresentation.setVolumeVisibility(false);
        model.volumeRepresentation.getActors().forEach((actor, index) => {
          if (index === axisIndex) {
            actor.setVisibility(true);
          } else {
            actor.setVisibility(false);
          }
        });
      }
      switch (axisIndex) {
        case 0:
          publicAPI.updateOrientation(0, 1, [0, 0, 1]);
          break;
        case 1:
          publicAPI.updateOrientation(1, -1, [0, 0, 1]);
          break;
        case 2:
          publicAPI.updateOrientation(2, -1, [0, -1, 0]);
          break;
        default:
          vtkErrorMacro('Unexpected view mode');
      }
    }
  }

  function leftPad(value) {
    const valueString = String(value);
    const padLength = valueString.length < 4 ? 4 - valueString.length : 0;
    const pad = '&nbsp;'.repeat(padLength);
    return `${pad}${valueString}`;
  }

  function rightPad(value) {
    const valueString = String(value);
    const padLength = valueString.length < 15 ? 15 - valueString.length : 0;
    const pad = '&nbsp;'.repeat(padLength);
    return `${valueString}${pad}`;
  }

  function updateAnnotations(callData) {
    const renderPosition = callData.position;
    model.annotationPicker.pick(
      [renderPosition.x, renderPosition.y, 0.0],
      callData.pokedRenderer
    );
    const ijk = model.annotationPicker.getCellIJK();
    if (model.volumeRepresentation) {
      const imageData = model.volumeRepresentation.getInputDataSet();
      const size = imageData.getDimensions();
      const scalarData = imageData.getPointData().getScalars();
      const value = scalarData.getTuple(
        size[0] * size[1] * ijk[2] + size[0] * ijk[1] + ijk[0]
      );
      const worldPosition = model.annotationPicker.getPCoords();
      if (ijk.length > 0) {
        model.dataProbeCubeSource.setCenter(worldPosition);
        model.dataProbeActor.setVisibility(true);
        model.dataProbeFrameActor.setVisibility(true);
        publicAPI.updateCornerAnnotation({
          iIndex: leftPad(ijk[0]),
          jIndex: leftPad(ijk[1]),
          kIndex: leftPad(ijk[2]),
          xPosition: leftPad(String(worldPosition[0]).substring(0, 4)),
          yPosition: leftPad(String(worldPosition[1]).substring(0, 4)),
          zPosition: leftPad(String(worldPosition[2]).substring(0, 4)),
          value: rightPad(value),
        });
      } else {
        model.dataProbeActor.setVisibility(false);
        model.dataProbeFrameActor.setVisibility(false);
      }
    }
  }

  // Setup --------------------------------------------------------------------

  publicAPI.setCornerAnnotation(
    'se',
    'Index: ${iIndex}, ${jIndex}, ${kIndex}<br>Position: ${xPosition}, ${yPosition}, ${zPosition}<br>Value:&nbsp;&nbsp;${value}'
  );
  publicAPI.updateCornerAnnotation({
    iIndex: '&nbsp;N/A',
    jIndex: '&nbsp;N/A',
    kIndex: '&nbsp;N/A',
    xPosition: '&nbsp;N/A',
    yPosition: '&nbsp;N/A',
    zPosition: '&nbsp;N/A',
    value:
      'N/A&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
  });
  publicAPI.setAnnotationOpacity(0.0);
  model.annotationPicker = vtkCellPicker.newInstance();
  model.annotationPicker.setPickFromList(1);
  model.annotationPicker.initializePickList();
  model.interactor.onMouseMove((event) => {
    updateAnnotations(event);
  });
  model.interactor.onStartMouseMove((event) => {
    publicAPI.getInteractor().requestAnimation('annotationMouseMove');
  });
  model.interactor.onEndMouseMove((event) => {
    publicAPI.getInteractor().cancelAnimation('annotationMouseMove');
  });
  model.interactor.onEndMouseWheel((event) => {
    updateDataProbeSize();
  });

  // use the same color map in the planes
  // colormap changes with window / level
  // window / level changes piecewise =jk
  publicAPI.resetOrientation();

  model.dataProbeCubeSource = vtkCubeSource.newInstance();
  model.dataProbeMapper = vtkMapper.newInstance();
  model.dataProbeMapper.setInputConnection(model.dataProbeCubeSource.getOutputPort());
  model.dataProbeActor = vtkActor.newInstance();
  model.dataProbeActor.setMapper(model.dataProbeMapper);
  model.dataProbeFrameActor = vtkActor.newInstance();
  model.dataProbeFrameActor.setMapper(model.dataProbeMapper);
  model.renderer.addActor(model.dataProbeActor);
  const dataProbeProperty = model.dataProbeActor.getProperty();
  dataProbeProperty.setLighting(false);
  dataProbeProperty.setColor(1.0, 1.0, 1.0);
  const dataProbeFrameProperty = model.dataProbeFrameActor.getProperty();
  dataProbeFrameProperty.setRepresentation(1);
  dataProbeFrameProperty.setColor(0.0, 0.0, 0.0);
  model.renderer.addActor(model.dataProbeFrameActor);
  model.dataProbeActor.setVisibility(false);
  model.dataProbeFrameActor.setVisibility(false);

  function updateDataProbeSize() {
    const image = model.volumeRepresentation.getInputDataSet();
    const spacing = image.getSpacing();
    let viewableScale = null;
    if (model.camera.getParallelProjection()) {
      viewableScale = model.camera.getParallelScale() / 40.;
    } else {
      const distance = model.camera.getDistance();
      // Heuristic assuming a constant view angle
      viewableScale = distance / 150.;
    }
    model.dataProbeCubeSource.setXLength(Math.max(spacing[0], viewableScale));
    model.dataProbeCubeSource.setYLength(Math.max(spacing[1], viewableScale));
    model.dataProbeCubeSource.setZLength(Math.max(spacing[2], viewableScale));
  }

  // API ----------------------------------------------------------------------

  publicAPI.setViewMode = (mode) => {
    if (model.viewMode === 'VolumeRendering') {
      model.volumeRenderingCameraState = model.camera.getState();
    }
    switch (mode) {
      case 'XPlane':
        model.viewMode = mode;
        setVisualizationMode(0);
        break;
      case 'YPlane':
        model.viewMode = mode;
        setVisualizationMode(1);
        break;
      case 'ZPlane':
        model.viewMode = mode;
        setVisualizationMode(2);
        break;
      case 'VolumeRendering':
        model.viewMode = mode;
        setVisualizationMode(-1);
        break;
      default:
        vtkErrorMacro('Unexpected view mode');
    }
    publicAPI.resetCamera();
    updateDataProbeSize();
  };

  publicAPI.setViewPlanes = (viewPlanes) => {
    model.viewPlanes = viewPlanes;
    if (model.viewMode === 'VolumeRendering' && model.volumeRepresentation) {
      model.volumeRepresentation.setSliceVisibility(viewPlanes);
      model.renderWindow.render();
    }
  };

  publicAPI.setOrientationAnnotationVisibility = (visible) => {
    if (visible) {
      if (model.volumeRepresentation) {
        publicAPI.setAnnotationOpacity(1.0);
        model.orientationWidget.setEnabled(true);
        model.renderWindow.render();
      }
    } else {
      publicAPI.setAnnotationOpacity(0.0);
      model.orientationWidget.setEnabled(false);
      model.renderWindow.render();
    }
  };

  const superAddRepresentation = publicAPI.addRepresentation;
  publicAPI.addRepresentation = (representation) => {
    superAddRepresentation(representation);

    if (!representation) {
      return;
    }

    const volumeRepresentations = model.representations.filter((rep) => {
      const isVolumeRepresentation = !!rep.getVolumes().length;
      return isVolumeRepresentation;
    });
    if (volumeRepresentations[0]) {
      model.volumeRepresentation = volumeRepresentations[0];
      model.volumeRepresentation
        .getActors()
        .forEach(model.annotationPicker.addPickList);
      updateDataProbeSize();
      publicAPI.setAnnotationOpacity(1.0);
    }
  };

  const superRemoveRepresentation = publicAPI.removeRepresentation;
  publicAPI.removeRepresentation = (representation) => {
    superRemoveRepresentation(representation);

    if (!representation) {
      return;
    }
    representation.getActors().forEach(model.annotationPicker.deletePickList);
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  viewMode: 'VolumeRendering',
  viewPlanes: false,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkViewProxy.extend(publicAPI, model, initialValues);
  macro.get(publicAPI, model, ['viewMode', 'viewPlanes']);

  // Object specific methods
  ItkVtkViewProxy(publicAPI, model);
}
// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'ItkVtkViewProxy');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
