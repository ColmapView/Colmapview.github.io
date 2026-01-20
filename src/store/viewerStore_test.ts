import { assertEquals } from "jsr:@std/assert";
import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { usePointCloudStore } from "./stores/pointCloudStore";
import { useCameraStore } from "./stores/cameraStore";
import { useUIStore } from "./stores/uiStore";

describe("pointCloudStore", () => {
  beforeEach(() => {
    usePointCloudStore.setState({
      pointSize: 2,
      colorMode: "rgb",
      minTrackLength: 2,
      selectedPointId: null,
    });
  });

  it("should update point size", () => {
    const { setPointSize } = usePointCloudStore.getState();
    setPointSize(5);
    assertEquals(usePointCloudStore.getState().pointSize, 5);
  });

  it("should update color mode", () => {
    const { setColorMode } = usePointCloudStore.getState();
    setColorMode("error");
    assertEquals(usePointCloudStore.getState().colorMode, "error");
  });

  it("should update min track length", () => {
    const { setMinTrackLength } = usePointCloudStore.getState();
    setMinTrackLength(5);
    assertEquals(usePointCloudStore.getState().minTrackLength, 5);
  });

  it("should select and deselect point", () => {
    const { setSelectedPointId } = usePointCloudStore.getState();

    setSelectedPointId(BigInt(123));
    assertEquals(usePointCloudStore.getState().selectedPointId, BigInt(123));

    setSelectedPointId(null);
    assertEquals(usePointCloudStore.getState().selectedPointId, null);
  });
});

describe("cameraStore", () => {
  beforeEach(() => {
    useCameraStore.setState({
      cameraDisplayMode: "frustum",
      cameraScale: 0.2,
      cameraMode: "orbit",
      flySpeed: 1,
      frustumColorMode: "single",
      unselectedCameraOpacity: 0.5,
      selectedImageId: null,
      selectionColorMode: "rainbow",
      selectionAnimationSpeed: 2.5,
      showImagePlanes: false,
      selectionPlaneOpacity: 0.9,
      flyToImageId: null,
    });
  });

  describe("camera display settings", () => {
    it("should update camera display mode", () => {
      const { setCameraDisplayMode } = useCameraStore.getState();
      setCameraDisplayMode("off");
      assertEquals(useCameraStore.getState().cameraDisplayMode, "off");
      setCameraDisplayMode("arrow");
      assertEquals(useCameraStore.getState().cameraDisplayMode, "arrow");
    });

    it("should update camera scale", () => {
      const { setCameraScale } = useCameraStore.getState();
      setCameraScale(0.5);
      assertEquals(useCameraStore.getState().cameraScale, 0.5);
    });

    it("should toggle image planes and set opacity", () => {
      const { setShowImagePlanes, setSelectionPlaneOpacity } =
        useCameraStore.getState();

      setShowImagePlanes(true);
      assertEquals(useCameraStore.getState().showImagePlanes, true);

      setSelectionPlaneOpacity(0.7);
      assertEquals(useCameraStore.getState().selectionPlaneOpacity, 0.7);
    });
  });

  describe("selection", () => {
    it("should select and deselect image", () => {
      const { setSelectedImageId } = useCameraStore.getState();

      setSelectedImageId(42);
      assertEquals(useCameraStore.getState().selectedImageId, 42);

      setSelectedImageId(null);
      assertEquals(useCameraStore.getState().selectedImageId, null);
    });

    it("should set selection color mode and animation speed", () => {
      const { setSelectionColorMode, setSelectionAnimationSpeed } =
        useCameraStore.getState();

      setSelectionColorMode("static");
      assertEquals(useCameraStore.getState().selectionColorMode, "static");

      setSelectionColorMode("blink");
      assertEquals(useCameraStore.getState().selectionColorMode, "blink");

      setSelectionColorMode("rainbow");
      assertEquals(useCameraStore.getState().selectionColorMode, "rainbow");

      setSelectionAnimationSpeed(3.0);
      assertEquals(useCameraStore.getState().selectionAnimationSpeed, 3.0);
    });
  });

  describe("fly to image", () => {
    it("should set and clear fly to image", () => {
      const { flyToImage, clearFlyTo } = useCameraStore.getState();

      flyToImage(42);
      assertEquals(useCameraStore.getState().flyToImageId, 42);

      clearFlyTo();
      assertEquals(useCameraStore.getState().flyToImageId, null);
    });
  });
});

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      imageDetailId: null,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: false,
      matchedImageId: null,
      matchesDisplayMode: "off",
      matchesOpacity: 1,
      showMaskOverlay: false,
      maskOpacity: 0.7,
      axesDisplayMode: "axes",
      axesOpacity: 1,
      backgroundColor: "#ffffff",
      autoRotate: false,
      viewResetTrigger: 0,
    });
  });

  describe("image detail modal", () => {
    it("should open image detail and reset matchedImageId", () => {
      const { openImageDetail, setMatchedImageId } = useUIStore.getState();

      setMatchedImageId(10);
      assertEquals(useUIStore.getState().matchedImageId, 10);

      openImageDetail(5);
      assertEquals(useUIStore.getState().imageDetailId, 5);
      assertEquals(useUIStore.getState().matchedImageId, null);
    });

    it("should close image detail and reset matchedImageId", () => {
      const { openImageDetail, setMatchedImageId, closeImageDetail } =
        useUIStore.getState();

      openImageDetail(5);
      setMatchedImageId(10);

      closeImageDetail();
      assertEquals(useUIStore.getState().imageDetailId, null);
      assertEquals(useUIStore.getState().matchedImageId, null);
    });

    it("should toggle showMatchesInModal", () => {
      const { setShowMatchesInModal } = useUIStore.getState();

      setShowMatchesInModal(true);
      assertEquals(useUIStore.getState().showMatchesInModal, true);

      setShowMatchesInModal(false);
      assertEquals(useUIStore.getState().showMatchesInModal, false);
    });
  });

  describe("view controls", () => {
    it("should toggle auto rotate", () => {
      const { setAutoRotate } = useUIStore.getState();
      setAutoRotate(true);
      assertEquals(useUIStore.getState().autoRotate, true);
    });

    it("should update background color", () => {
      const { setBackgroundColor } = useUIStore.getState();
      setBackgroundColor("#000000");
      assertEquals(useUIStore.getState().backgroundColor, "#000000");
    });

    it("should increment view reset trigger", () => {
      const { resetView } = useUIStore.getState();
      const initialTrigger = useUIStore.getState().viewResetTrigger;

      resetView();
      assertEquals(useUIStore.getState().viewResetTrigger, initialTrigger + 1);
    });
  });

  describe("helpers visibility", () => {
    it("should set axes display mode and opacity", () => {
      const { setAxesDisplayMode, setAxesOpacity } = useUIStore.getState();

      setAxesDisplayMode("off");
      assertEquals(useUIStore.getState().axesDisplayMode, "off");

      setAxesDisplayMode("grid");
      assertEquals(useUIStore.getState().axesDisplayMode, "grid");

      setAxesOpacity(0.5);
      assertEquals(useUIStore.getState().axesOpacity, 0.5);
    });

    it("should set matches display mode and opacity", () => {
      const { setMatchesDisplayMode, setMatchesOpacity } =
        useUIStore.getState();

      setMatchesDisplayMode("on");
      assertEquals(useUIStore.getState().matchesDisplayMode, "on");

      setMatchesDisplayMode("blink");
      assertEquals(useUIStore.getState().matchesDisplayMode, "blink");

      setMatchesOpacity(0.8);
      assertEquals(useUIStore.getState().matchesOpacity, 0.8);
    });
  });
});
